import { createScenario, addEvent } from '../domain/scenario.js';
import { assert, validateJob, validateEngineer } from '../domain/validation.js';
import { advance } from '../domain/lifecycle.js';
import { replan } from './planning.js';
import { createOfficialScenario } from '../domain/official-scenario.js';
import { COLORS } from '../domain/catalog.js';
import { attachDiff } from '../domain/plan-diff.js';
import fs from 'node:fs/promises';
import { migrateWorkPolicy } from '../domain/policy-migration.js';
import { OFFICIAL_POLICY } from '../domain/official-policy.js';
const finite = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
export async function applyAction(current, action, opts = {}) {
  let state = structuredClone(current);
  const { type, payload: p = {} } = action;
  switch (type) {
    case 'generate': {
      assert(Number.isInteger(p.count) && p.count >= 1 && p.count <= 100, 'Число заявок: 1–100');
      assert(
        Number.isInteger(p.engineerCount) && p.engineerCount >= 1 && p.engineerCount <= 40,
        'Число инженеров: 1–40',
      );
      assert(
        Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 4294967295,
        'Seed: целое число от 0 до 4294967295',
      );
      state = createScenario(p);
      state.settings = { ...current.settings, roadMode: 'estimate' };
      addEvent(state, 'Создан новый день', `${p.count} заявок · seed ${p.seed}`);
      break;
    }
    case 'dataset.load': {
      state = await createOfficialScenario(p.id);
      addEvent(
        state,
        'Загружен участок',
        `${state.dataset.name}: ${state.jobs.length} заявок. Состав инженеров синтетический.`,
      );
      break;
    }
    case 'office.save': {
      assert(finite(p.lat, -85, 85) && finite(p.lng, -180, 180), 'Укажите координаты офиса');
      assert(
        !state.jobs.some((j) => ['enroute', 'working'].includes(j.status)),
        'Дождитесь завершения текущих выездов',
      );
      for (const e of state.engineers) {
        e.home = { ...e.home, lat: p.lat, lng: p.lng };
        if (!state.jobs.some((j) => j.engineerId === e.id && j.status === 'done')) e.position = { ...e.home };
      }
      if (state.dataset)
        state.dataset.office = {
          ...state.dataset.office,
          lat: p.lat,
          lng: p.lng,
          approximate: false,
          assumption: null,
          confirmedAt: new Date().toISOString(),
          precision: 'manual',
          confirmationNote: String(p.confirmationNote || 'Точка подтверждена диспетчером'),
        };
      for (const j of state.jobs)
        if (j.status === 'manual_review' && j.reviewReason?.code === 'coordinates') {
          j.status = 'pending';
          j.reviewReason = null;
          for (const t of state.support)
            if (t.jobId === j.id && t.kind === 'scheduling' && t.status === 'open') t.status = 'resolved';
        }
      addEvent(state, 'Координаты офиса подтверждены');
      break;
    }
    case 'geography.confirm': {
      const original = state.jobs.find((j) => j.id === p.id);
      assert(
        original && !['done', 'working', 'enroute'].includes(original.status),
        'Уточнять можно только ещё не начатые заявки',
      );
      assert(finite(p.lat, -85, 85) && finite(p.lng, -180, 180), 'Укажите координаты здания');
      assert(
        typeof p.confirmationNote === 'string' && p.confirmationNote.trim().length > 0,
        'Укажите источник или результат проверки адреса',
      );
      for (const job of state.jobs.filter(
        (j) => j.address === original.address && !['done', 'working', 'enroute'].includes(j.status),
      )) {
        state.history.push({
          type: 'geography.confirmed',
          jobId: job.id,
          time: state.time,
          before: { lat: job.lat, lng: job.lng },
          after: { lat: p.lat, lng: p.lng },
          comment: p.confirmationNote.trim(),
        });
        Object.assign(job, {
          lat: p.lat,
          lng: p.lng,
          geocode: {
            status: 'matched',
            precision: 'manual',
            provider: 'dispatcher',
            confirmedAt: new Date().toISOString(),
            note: p.confirmationNote.trim(),
          },
        });
        if (job.status === 'manual_review' && job.reviewReason?.code === 'coordinates') {
          job.status = 'pending';
          job.reviewReason = null;
          for (const ticket of state.support)
            if (ticket.jobId === job.id && ticket.kind === 'scheduling') ticket.status = 'resolved';
        }
      }
      addEvent(state, 'Адрес проверен', original.address);
      break;
    }
    case 'job.resolve': {
      const job = state.jobs.find((j) => j.id === p.id);
      assert(job?.status === 'manual_review', 'Заявка не ожидает согласования');
      assert(
        typeof p.confirmationNote === 'string' &&
          p.confirmationNote.trim().length > 0 &&
          p.confirmationNote.length <= 2000,
        'Укажите результат согласования с клиентом или проверки адреса',
      );
      const valid = validateJob({ ...job, ...p });
      const pinned = p.pinnedEngineerId || null;
      assert(!pinned || state.engineers.some((e) => e.id === pinned), 'Выбранный инженер не найден');
      const before = { windowStart: job.windowStart, windowEnd: job.windowEnd, lat: job.lat, lng: job.lng };
      job.originalWindow ??= { start: job.windowStart, end: job.windowEnd };
      Object.assign(job, valid, { status: 'pending', reviewReason: null, pinnedEngineerId: pinned });
      if (job.lat !== before.lat || job.lng !== before.lng)
        job.geocode = {
          status: 'matched',
          precision: 'manual',
          provider: 'dispatcher',
          confirmedAt: new Date().toISOString(),
          note: p.confirmationNote.trim(),
        };
      job.notes.push({
        id: crypto.randomUUID(),
        time: state.time,
        text: `Согласование диспетчера: ${p.confirmationNote.trim()}`,
      });
      state.history.push({
        type: 'job.rescheduled',
        jobId: job.id,
        time: state.time,
        before,
        after: { windowStart: job.windowStart, windowEnd: job.windowEnd, lat: job.lat, lng: job.lng },
        comment: p.confirmationNote.trim(),
      });
      for (const ticket of state.support)
        if (ticket.jobId === job.id && ticket.kind === 'scheduling' && ticket.status === 'open')
          ticket.status = 'resolved';
      addEvent(state, 'Согласованное время передано в планирование', `№${job.number}`);
      break;
    }
    case 'job.save': {
      const valid = validateJob(p);
      let job = p.id ? state.jobs.find((j) => j.id === p.id) : null;
      if (p.id) assert(job && job.status === 'pending', 'Изменять можно только ещё не начатые заявки');
      if (job) {
        Object.assign(job, valid);
      } else {
        assert(state.jobs.length < 100, 'В прототипе поддерживается до 100 заявок');
        job = {
          ...valid,
          id: crypto.randomUUID(),
          number: state.nextNumber++,
          status: 'pending',
          engineerId: null,
          notes: [],
          actualStart: null,
          actualEnd: null,
          createdAt: state.time,
        };
        state.jobs.push(job);
        if (job.priority === 'urgent') state.settings.mode = 'emergency';
      }
      addEvent(
        state,
        p.id ? 'Заявка обновлена' : 'Создана новая заявка',
        `№${job.number} · ${job.address}`,
        null,
        job.priority === 'urgent' ? 'warning' : 'info',
      );
      break;
    }
    case 'job.assign': {
      const job = state.jobs.find((j) => j.id === p.id);
      assert(job?.status === 'pending', 'Переназначать можно только ещё не начатые заявки');
      assert(
        p.engineerId === null || state.engineers.some((e) => e.id === p.engineerId),
        'Инженер не найден',
      );
      const before = job.pinnedEngineerId || null;
      job.pinnedEngineerId = p.engineerId;
      state.history.push({
        type: 'job.assignment',
        jobId: job.id,
        time: state.time,
        before,
        after: p.engineerId,
      });
      addEvent(state, p.engineerId ? 'Исполнитель закреплён' : 'Закрепление снято', `№${job.number}`);
      break;
    }
    case 'jobs.random': {
      assert(Number.isInteger(p.count) && p.count >= 1 && p.count <= 20, 'Добавление: от 1 до 20 заявок');
      assert(
        Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 4294967295,
        'Seed: целое число от 0 до 4294967295',
      );
      assert(state.jobs.length + p.count <= 100, 'В прототипе поддерживается до 100 заявок');
      const generated = createScenario({
        seed: p.seed,
        count: p.count,
        engineerCount: state.engineers.length,
      });
      for (const job of generated.jobs) {
        const start = Math.min(1380, Math.max(job.windowStart, state.time + 15));
        job.windowEnd = Math.min(1439, start + (job.windowEnd - job.windowStart));
        job.windowStart = start;
        job.id = crypto.randomUUID();
        job.number = state.nextNumber++;
        job.createdAt = state.time;
        state.jobs.push(job);
      }
      if (generated.jobs.some((job) => job.priority === 'urgent')) state.settings.mode = 'emergency';
      addEvent(state, 'Поступили новые заявки', `${p.count} заявок · seed ${p.seed}`);
      break;
    }
    case 'job.delete': {
      const job = state.jobs.find((j) => j.id === p.id);
      assert(
        job && ['pending', 'manual_review'].includes(job.status),
        'Удалять можно только ещё не начатые заявки',
      );
      state.jobs = state.jobs.filter((j) => j.id !== p.id);
      state.support = state.support.filter((s) => s.jobId !== p.id);
      addEvent(state, 'Заявка удалена', `№${job.number}`);
      break;
    }
    case 'engineer.save': {
      let engineer = p.id ? state.engineers.find((e) => e.id === p.id) : null;
      if (!p.id) {
        assert(state.engineers.length < 40, 'Максимум 40 инженеров');
        const valid = validateEngineer(p);
        engineer = {
          id: crypto.randomUUID(),
          ...valid,
          position: { ...valid.home },
          color: COLORS[state.engineers.length % COLORS.length],
          pausedUntil: 0,
          synthetic: true,
        };
        state.engineers.push(engineer);
      }
      assert(engineer, 'Инженер не найден');
      assert(
        !state.jobs.some((j) => j.engineerId === p.id && ['enroute', 'working'].includes(j.status)),
        'Сначала завершите текущий выезд перед изменением ресурсов',
      );
      const valid = validateEngineer(p);
      Object.assign(engineer, valid);
      if (!state.jobs.some((j) => j.engineerId === p.id && ['done', 'working', 'enroute'].includes(j.status)))
        engineer.position = { ...valid.home };
      addEvent(state, 'Ресурсы инженера обновлены', engineer.name);
      break;
    }
    case 'engineer.pause': {
      const engineer = state.engineers.find((e) => e.id === p.id);
      assert(engineer, 'Инженер не найден');
      assert(finite(p.minutes, 0, 180), 'Перерыв: 0–180 минут');
      const active = state.jobs.find(
        (j) => j.engineerId === p.id && ['enroute', 'working'].includes(j.status),
      );
      const start = Math.max(state.time, active?.lockedStop?.end || 0);
      engineer.pausedUntil = p.minutes ? start + p.minutes : 0;
      addEvent(
        state,
        p.minutes ? 'Перерыв запланирован' : 'Инженер доступен',
        p.minutes ? `${p.minutes} мин${active ? ' после текущей заявки' : ''}` : engineer.name,
        p.id,
      );
      break;
    }
    case 'job.note': {
      const job = state.jobs.find((j) => j.id === p.id);
      assert(job, 'Заявка не найдена');
      assert(
        typeof p.text === 'string' && p.text.trim() && p.text.length <= 2000,
        'Заметка: 1–2000 символов',
      );
      job.notes.push({
        id: crypto.randomUUID(),
        time: state.time,
        text: p.text.trim(),
        engineerId: job.engineerId,
      });
      addEvent(
        state,
        'Новый отчёт с объекта',
        `№${job.number} · ${p.text.trim().slice(0, 120)}`,
        job.engineerId,
      );
      break;
    }
    case 'job.complete': {
      const job = state.jobs.find((j) => j.id === p.id);
      assert(job?.status === 'working', 'Завершить можно только начатую работу');
      job.status = 'done';
      job.actualEnd = state.time;
      addEvent(state, 'Работа завершена инженером', `№${job.number}`, job.engineerId, 'success');
      break;
    }
    case 'job.issue': {
      const job = state.jobs.find((j) => j.id === p.id);
      assert(job && job.status !== 'done', 'Заявка недоступна');
      const text = String(p.text || 'Нужна помощь диспетчера').slice(0, 2000);
      state.support.push({ id: crypto.randomUUID(), jobId: job.id, time: state.time, text, status: 'open' });
      job.status = 'blocked';
      addEvent(state, 'Нужна помощь на объекте', `№${job.number} · ${text}`, job.engineerId, 'warning');
      break;
    }
    case 'support.create': {
      for (const item of state.plan?.unassigned || [])
        if (!state.support.some((s) => s.jobId === item.jobId && s.status === 'open'))
          state.support.push({
            id: crypto.randomUUID(),
            jobId: item.jobId,
            time: state.time,
            text: item.text,
            status: 'open',
          });
      addEvent(state, 'Очередь поддержки обновлена', 'Неназначенные заявки переданы диспетчеру');
      break;
    }
    case 'support.resolve': {
      const ticket = state.support.find((t) => t.id === p.id);
      assert(ticket, 'Обращение не найдено');
      assert(ticket.kind !== 'scheduling', 'Откройте заявку и укажите результат согласования с клиентом');
      ticket.status = 'resolved';
      const job = state.jobs.find((j) => j.id === ticket.jobId);
      if (job?.status === 'blocked') {
        job.status = 'pending';
        job.actualStart = null;
        job.lockedStop = null;
      }
      addEvent(state, 'Обращение обработано', 'Заявка возвращена в планирование');
      break;
    }
    case 'clock':
      advance(state, p.time);
      break;
    case 'settings':
      assert(['estimate', 'osrm', 'prepared'].includes(p.roadMode), 'Неизвестный режим дорожных данных');
      assert(
        ['economy', 'emergency'].includes(p.mode || state.settings.mode || 'economy'),
        'Неизвестный режим оптимизации',
      );
      state.settings = {
        ...state.settings,
        roadMode: p.roadMode,
        stability: p.stability !== false,
        mode: p.mode || state.settings.mode || 'economy',
      };
      break;
    case 'optimize':
      addEvent(state, 'Расписание пересчитано', 'Окна визитов, ресурсы и доступность проверены');
      break;
    case 'import': {
      assert(
        Array.isArray(p.jobs) && p.jobs.length > 0 && p.jobs.length <= 100,
        'Импорт: требуется 1–100 заявок',
      );
      assert(
        Array.isArray(p.engineers) && p.engineers.length > 0 && p.engineers.length <= 40,
        'Импорт: требуется 1–40 инженеров',
      );
      state = createScenario({ count: 1, engineerCount: p.engineers.length });
      state.engineers = p.engineers.map((e, i) => ({
        ...state.engineers[i],
        ...validateEngineer(e),
        id: typeof e.id === 'string' && e.id.length < 128 ? e.id : `eng-${i + 1}`,
        position: { ...validateEngineer(e).home },
      }));
      assert(
        new Set(state.engineers.map((e) => e.id)).size === state.engineers.length,
        'Повторные ID инженеров',
      );
      state.jobs = p.jobs.map((j, i) => ({
        ...validateJob(j, { allowUnresolved: true }),
        id: typeof j.id === 'string' && j.id.length < 128 ? j.id : `job-${i + 1}`,
        number: /^\d{1,12}$/.test(String(j.number)) ? j.number : 1001 + i,
        source: j.source,
        originalWindow: j.originalWindow,
        pinnedEngineerId: j.pinnedEngineerId || null,
        geocodingCandidates: Array.isArray(j.geocodingCandidates)
          ? j.geocodingCandidates
              .filter(
                (c) => finite(c.lat, -85, 85) && finite(c.lng, -180, 180) && typeof c.label === 'string',
              )
              .slice(0, 5)
          : [],
        status: 'pending',
        engineerId: null,
        notes: [],
        actualStart: null,
        actualEnd: null,
        createdAt: 480,
      }));
      assert(new Set(state.jobs.map((j) => j.id)).size === state.jobs.length, 'Повторные ID заявок');
      assert(
        state.jobs.every(
          (j) => !j.pinnedEngineerId || state.engineers.some((e) => e.id === j.pinnedEngineerId),
        ),
        'Неизвестный закреплённый инженер',
      );
      state.nextNumber = 1 + Math.max(...state.jobs.map((j) => Number(j.number)));
      state.settings = { ...current.settings, roadMode: 'estimate' };
      addEvent(state, 'Сценарий импортирован', 'Новый день начинается в 08:00');
      if (
        p.catalogVersion !== OFFICIAL_POLICY.version &&
        state.jobs.some((j) => j.source?.fields?.['Тип заявки BK'] && !j.source.policyVersion)
      ) {
        delete state.catalogVersion;
        const norms = JSON.parse(
          await fs.readFile(new URL('../../data/beeline/norms.json', import.meta.url), 'utf8'),
        );
        migrateWorkPolicy(state, norms);
      }
      break;
    }
    default:
      assert(false, 'Неизвестное действие');
  }
  const skip = ['job.note', 'support.create'].includes(type);
  if (!skip) await replan(state, opts);
  if (!skip) attachDiff(current, state);
  state.revision = current.revision + 1;
  return state;
}

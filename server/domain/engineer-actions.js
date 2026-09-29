import { startWorkTimer, finishWorkTimer } from './work-timer.js';
import { openKitShortage } from '../../src/shared/kit-shortage.js';
import { assert } from './validation.js';
import { addEvent } from './scenario.js';
import { shiftKit, sopReady } from '../../src/shared/shift-kit.js';

export function engineerAction(state, type, p) {
  assert(
    p.expectedRevision === state.revision,
    'Данные изменились. Повторите действие по актуальному плану.',
  );
  if (type === 'engineer.kit.check') {
    assert(state.settings.autoChecklists === false, 'Для изменения отметок включите ручное прохождение');
    const e = state.engineers.find((e) => e.id === p.id);
    assert(e, 'Инженер не найден');
    assert(!openKitShortage(state, e.id), 'Дождитесь решения диспетчера по комплекту');
    const before = shiftKit(state, e);
    const item = before.items.find((i) => i.key === p.key);
    assert(item && typeof p.done === 'boolean', 'Пункт комплекта не найден');
    e.kitChecks ??= {};
    if (p.done) e.kitChecks[item.key] = item.signature;
    else delete e.kitChecks[item.key];
    state.history.push({ type, engineerId: e.id, key: item.key, done: p.done, time: state.time });
    if (!before.ready && shiftKit(state, e).ready)
      addEvent(state, 'Комплект на смену собран', e.name, e.id, 'success');
    return;
  }
  const job = state.jobs.find((j) => j.id === p.id);
  const e = state.engineers.find((e) => e.id === job?.engineerId);
  assert(job && e, 'Назначенная заявка не найдена');
  const stop = state.plan.routes.find((r) => r.engineerId === e.id)?.stops[0];
  if (type === 'job.depart') {
    assert(job.status === 'pending' && stop?.jobId === job.id, 'Выезжать можно только на ближайшую работу');
    assert(
      !state.jobs.some((j) => j.engineerId === e.id && ['enroute', 'working'].includes(j.status)),
      'Сначала завершите текущий визит',
    );
    assert(
      !e.shiftWithdrawn && !openKitShortage(state, e.id),
      'Выезд приостановлен: требуется решение диспетчера',
    );
    assert(shiftKit(state, e).ready, 'Сначала соберите комплект на смену');
    assert(
      state.time >= e.shiftStart && state.time < e.shiftEnd && !(e.pausedUntil > state.time),
      'Инженер вне смены или на перерыве',
    );
    const arrival = state.time + stop.travel;
    const start = Math.max(arrival, job.windowStart);
    assert(
      start <= job.windowEnd && start + job.duration <= e.shiftEnd,
      'Визит не укладывается в окно или смену. Пересчитайте план.',
    );
    job.lockedStop = {
      ...structuredClone(stop),
      depart: state.time,
      arrival,
      start,
      end: start + job.duration,
      wait: start - arrival,
    };
    job.status = 'enroute';
    job.departedAt = state.time;
    job.arrivedAt = null;
    addEvent(state, 'Инженер выехал', `№${job.number} · ${job.address}`, e.id);
  } else if (type === 'job.arrive') {
    assert(
      job.status === 'enroute' && job.arrivedAt == null,
      'Выезд уже отмечен как прибывший или недоступен',
    );
    job.arrivedAt = state.time;
    e.position = { lat: job.lat, lng: job.lng };
    job.lockedStop.arrival = state.time;
    job.lockedStop.start = Math.max(state.time, job.windowStart);
    job.lockedStop.end = job.lockedStop.start + job.duration;
    job.lockedStop.wait = job.lockedStop.start - state.time;
    addEvent(state, 'Инженер на месте', `№${job.number}`, e.id);
  } else if (type === 'job.start') {
    assert(job.status === 'enroute' && job.arrivedAt != null, 'Сначала отметьте прибытие');
    assert(
      state.time >= job.windowStart && state.time <= job.windowEnd,
      'Начало работы должно попадать в окно клиента',
    );
    assert(state.time + job.duration <= e.shiftEnd, 'Работа не укладывается в смену');
    job.status = 'working';
    job.actualStart = state.time;
    startWorkTimer(job);
    addEvent(state, 'Работа начата', `№${job.number}`, e.id);
  } else if (type === 'job.finish') {
    assert(job.status === 'working', 'Завершить можно только начатую работу');
    assert(['complete', 'partial', 'failed'].includes(p.outcome), 'Выберите результат визита');
    assert(p.outcome !== 'complete' || sopReady(job), 'Сначала пройдите чек-лист SOP');
    assert(
      p.outcome !== 'complete' || !job.sop?.diagnosticsOnly,
      'Диагностика не закрывает ремонт аварии. Передайте результат диспетчеру.',
    );
    const comment = String(p.comment || '').trim();
    assert(
      p.outcome === 'complete' || (comment.length > 0 && comment.length <= 2000),
      'Опишите результат и что требуется сделать дальше',
    );
    job.visitResult = { outcome: p.outcome, comment, time: state.time };
    job.actualEnd = state.time;
    finishWorkTimer(state, job, e.id, p.outcome);
    if (p.outcome === 'complete') job.status = 'done';
    else {
      job.attempts ??= [];
      job.attempts.push({
        engineerId: e.id,
        stop: structuredClone(job.lockedStop),
        start: job.actualStart,
        end: state.time,
      });
      job.lockedStop = null;
      job.actualStart = null;
      job.status = 'blocked';
      state.support.push({
        id: crypto.randomUUID(),
        jobId: job.id,
        time: state.time,
        text: comment,
        status: 'open',
      });
    }
    addEvent(
      state,
      'Результат визита получен',
      `№${job.number} · ${p.outcome === 'complete' ? 'Всё выполнено' : p.outcome === 'partial' ? 'Выполнено частично' : 'Не удалось выполнить'}${comment ? ` · ${comment}` : ''}`,
      e.id,
      p.outcome === 'complete' ? 'success' : 'warning',
    );
  }
  job.manualExecution = true;
  state.history.push({ type, jobId: job.id, engineerId: e.id, time: state.time, outcome: p.outcome });
}

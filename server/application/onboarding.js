import { createScenario } from '../domain/scenario.js';
import { replan } from './planning.js';
import { previewAction, activateCandidate } from './candidates.js';
import { applyAction } from './actions.js';
import { recommendEngineers } from './engineer-recommendations.js';

const options = { roads: false, iterations: 20 };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export async function createOnboardingState() {
  const state = createScenario({ seed: 42, count: 7, engineerCount: 3 });
  state.dataset = { id: 'onboarding', name: 'Учебный день', date: 'Сегодня' };
  state.settings = { ...state.settings, autoChecklists: true, roadMode: 'estimate' };
  const addresses = [
    'Тверская улица, 12',
    'Арбат, 10',
    'Пречистенка, 17',
    'Покровка, 8',
    'Мясницкая, 24',
    'Садовая-Кудринская, 15',
    'Большая Никитская, 22',
  ];
  state.engineers.forEach((e, i) =>
    Object.assign(e, {
      name: ['Анна Смирнова', 'Илья Козлов', 'Мария Волкова'][i],
      skills: ['local', 'connection'],
      transport: 'foot',
      shiftStart: 480,
      shiftEnd: 1080,
      home: { lat: 55.75, lng: 37.61 },
      position: { lat: 55.75, lng: 37.61 },
    }),
  );
  state.jobs.forEach((j, i) =>
    Object.assign(j, {
      address: addresses[i],
      title: i ? 'Подключение клиента' : 'Срочное восстановление связи',
      type: i ? 'connection' : 'local',
      skills: [i ? 'connection' : 'local'],
      equipment: [],
      requiredTransport: 'any',
      lat: 55.75 + i * 0.002,
      lng: 37.62 + i * 0.002,
      windowStart: 540,
      windowEnd: 1020,
      duration: i ? 40 : 30,
      priority: i ? 'normal' : 'urgent',
      status: i ? 'pending' : 'manual_review',
      pinnedEngineerId: i ? state.engineers[(i - 1) % 3].id : null,
    }),
  );
  state.support.push({
    id: 'onboarding-urgent',
    jobId: state.jobs[0].id,
    time: 480,
    kind: 'scheduling',
    status: 'open',
    text: 'Адрес подтверждён. Согласуйте срочный визит и выберите инженера.',
  });
  await replan(state, options);
  return state;
}

// Separate in-memory sessions: no reference to the live day, persistence or SSE.
export function createOnboardingSessions({ ttl = 60 * 60 * 1000, limit = 32, now = Date.now } = {}) {
  const sessions = new Map();
  return async function handle(id, endpoint, method, input = {}) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw fail('Неверный идентификатор обучения');
    const timestamp = now();
    for (const [key, value] of sessions)
      if (timestamp - value.lastUsed > ttl && !value.active) sessions.delete(key);
    let session = sessions.get(id);
    if (!session) {
      if (!(endpoint === '/state' && method === 'GET'))
        throw fail('Учебная сессия завершилась. Начните обучение заново.', 410);
      if (sessions.size >= limit) throw fail('Сейчас много учебных сессий. Попробуйте позже.', 429);
      session = {
        ready: createOnboardingState(),
        queue: Promise.resolve(),
        candidates: new Map(),
        lastUsed: timestamp,
        active: 0,
      };
      sessions.set(id, session);
    }
    session.lastUsed = timestamp;
    session.active++;
    const run = session.queue.then(async () => {
      session.state ||= await session.ready;
      if (endpoint === '/state' && method === 'GET') return structuredClone(session.state);
      if (endpoint === '/reset' && method === 'POST') {
        const fresh = await createOnboardingState();
        fresh.revision = session.state.revision + 1;
        session.state = fresh;
        session.candidates.clear();
        return structuredClone(fresh);
      }
      if (endpoint === '/engineer-demo' && method === 'POST') {
        if (input.expectedRevision !== session.state.revision)
          throw fail('Учебный план изменился. Повторите переход.', 409);
        if (!['travel', 'work'].includes(input.stage)) throw fail('Неизвестный этап обучения');
        let next = structuredClone(session.state);
        const route = next.plan.routes.find((r) => r.engineerId === input.engineerId);
        const job = next.jobs.find((j) => j.id === route?.stops[0]?.jobId);
        if (!job) throw fail('Учебная работа не найдена');
        const act = async (type) => {
          next = await applyAction(
            next,
            { type, payload: { id: job.id, expectedRevision: next.revision } },
            options,
          );
        };
        if (input.stage === 'travel') {
          if (job.status !== 'pending') throw fail('Учебный выезд уже начат');
          await act('job.depart');
        } else {
          if (job.status !== 'enroute') throw fail('Сначала откройте учебный выезд');
          // Skip waiting only inside this isolated lesson; keep real lifecycle validation.
          next.time = Math.max(next.time, job.windowStart, job.lockedStop.arrival);
          await act('job.arrive');
          await act('job.start');
          const working = next.jobs.find((j) => j.id === job.id);
          if (!working.sop?.steps.length) throw fail('Для учебной работы нужен SOP');
          next.settings.autoChecklists = false;
          working.sop.steps.at(-1).done = false;
          working.sop.steps.at(-1).completedAt = null;
        }
        next.onboardingStage = input.stage;
        session.state = next;
        session.candidates.clear();
        return structuredClone(next);
      }
      if (endpoint === '/engineer-recommendations' && method === 'POST')
        return recommendEngineers(session.state, input, {
          travel: { matrix: {}, source: 'estimate', detail: 'Учебная оценка дороги' },
        });
      if (endpoint === '/preview' && method === 'POST') {
        if (!['job.assign', 'job.resolve', 'optimize'].includes(input.type))
          throw fail('Это действие не входит в учебный сценарий');
        const candidate = await previewAction(session.state, input, options);
        session.candidates.set(candidate.id, candidate);
        while (session.candidates.size > 6) session.candidates.delete(session.candidates.keys().next().value);
        return structuredClone(candidate);
      }
      if (endpoint === '/preview/apply' && method === 'POST') {
        session.state = activateCandidate(
          session.state,
          session.candidates.get(input.id),
          input.expectedRevision,
        );
        session.candidates.clear();
        return structuredClone(session.state);
      }
      if (endpoint.startsWith('/preview/') && method === 'DELETE') {
        session.candidates.delete(endpoint.split('/').at(-1));
        return { ok: true };
      }
      if (endpoint === '/action' && method === 'POST') {
        if (
          !['job.note', 'simulation.checklists', 'engineer.kit.check', 'job.sop.check'].includes(input.type)
        )
          throw fail('Это действие не входит в учебный сценарий');
        session.state = await applyAction(session.state, input, options);
        return structuredClone(session.state);
      }
      throw fail('Учебное действие не найдено', 404);
    });
    session.queue = run.catch(() => {});
    try {
      return await run;
    } finally {
      session.active--;
      session.lastUsed = now();
    }
  };
}

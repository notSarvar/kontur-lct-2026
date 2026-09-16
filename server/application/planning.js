import { solve } from '../optimization/solver.js';
import { getTravel, addGeometries } from '../infrastructure/routing.js';
import { addEvent } from '../domain/scenario.js';

export async function replan(state, { roads = true, iterations } = {}) {
  const old = {};
  for (const r of state.plan?.routes || []) for (const s of r.stops) old[s.jobId] = r.engineerId;
  const travel = roads
    ? await getTravel(state)
    : {
        matrix: {},
        source: 'estimate',
        detail: 'Ходьба и общественный транспорт: оценка по координатам, без расписаний и дорожной сети.',
      };
  state.plan = solve(state, travel.matrix, { iterations });
  state.plan.roadSource = travel.source;
  state.plan.roadDetail = travel.detail;
  for (const job of state.jobs) if (['pending', 'manual_review'].includes(job.status)) job.engineerId = null;
  for (const r of state.plan.routes)
    for (const stop of r.stops) {
      const job = state.jobs.find((j) => j.id === stop.jobId);
      job.engineerId = r.engineerId;
      if (job.status === 'pending' && old[job.id] !== r.engineerId)
        addEvent(
          state,
          old[job.id] ? 'Маршрут изменён' : 'Новая заявка в маршруте',
          `№${job.number} · ${job.address}`,
          r.engineerId,
          'assignment',
        );
    }
  for (const entry of state.plan.unassigned) {
    const job = state.jobs.find((j) => j.id === entry.jobId);
    if (job.status !== 'pending') continue;
    job.status = 'manual_review';
    job.reviewReason = { code: entry.code, text: entry.text };
    job.originalWindow ??= { start: job.windowStart, end: job.windowEnd };
    state.support.push({
      id: crypto.randomUUID(),
      jobId: job.id,
      time: state.time,
      text: entry.text,
      status: 'open',
      kind: 'scheduling',
    });
    addEvent(state, 'Требует согласования', `№${job.number}: ${entry.text}`, null, 'warning');
  }
  await addGeometries(state);
  return state;
}

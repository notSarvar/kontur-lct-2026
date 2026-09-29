import { assert, validateJob } from '../domain/validation.js';
import { createEvaluator, contextFor, incompatibilities } from '../optimization/evaluate.js';
import { legFunction } from '../optimization/travel.js';
import { getTravel } from '../infrastructure/routing.js';
import { conflict } from './candidates.js';

// Read-only insertion search: retain every existing assignment and its order.
export async function recommendEngineers(current, input, options = {}) {
  if (input.expectedRevision !== current.revision)
    throw conflict('План изменился. Обновите подбор инженеров.');
  const source = current.jobs.find((j) => j.id === input.job?.id);
  assert(source?.status === 'manual_review', 'Подбор доступен для заявки на согласовании');
  const job = {
    ...source,
    ...validateJob({ ...source, ...input.job }),
    status: 'pending',
    pinnedEngineerId: null,
  };
  assert(job.priority === 'urgent', 'Автоподбор предназначен для срочной заявки');
  const state = structuredClone(current);
  state.jobs[state.jobs.findIndex((j) => j.id === job.id)] = job;
  const travel = options.travel || (await getTravel(state));
  const evaluate = createEvaluator(state, legFunction(travel.matrix));
  const byId = new Map(state.jobs.map((j) => [j.id, j]));
  const candidates = [];
  const excluded = { incompatible: 0, schedule: 0 };
  const compare = (a, b) =>
    a.start - b.start ||
    a.delayedJobs - b.delayedJobs ||
    a.totalDelay - b.totalDelay ||
    a.extraTravel - b.extraTravel ||
    a.engineerId.localeCompare(b.engineerId);
  for (const engineer of state.engineers) {
    if (incompatibilities(job, engineer).length) {
      excluded.incompatible++;
      continue;
    }
    const route = state.plan.routes.find((r) => r.engineerId === engineer.id);
    const pending = (route?.stops || [])
      .map((s) => byId.get(s.jobId))
      .filter((j) => j?.status === 'pending' && j.id !== job.id);
    const existing = new Map((route?.stops || []).map((s) => [s.jobId, s]));
    const base = evaluate(engineer, pending);
    if (!base) {
      excluded.schedule++;
      continue;
    }
    const context = contextFor(state, engineer);
    const windows = [];
    const describe = (stops) =>
      stops.map((stop) => ({
        ...stop,
        label: byId.get(stop.jobId)?.address || byId.get(stop.jobId)?.title || stop.jobId,
      }));
    let best;
    for (let index = 0; index <= pending.length; index++) {
      const result = evaluate(engineer, [...pending.slice(0, index), job, ...pending.slice(index)]);
      if (!result) continue;
      const stop = result.stops[index];
      // Propagate the latest feasible start backwards through the fixed route.
      // Travel is time-independent; waiting at later clients can absorb a delay.
      let latest = engineer.shiftEnd;
      for (let i = result.stops.length - 1; i >= index; i--) {
        const visit = result.stops[i];
        const scheduledJob = byId.get(visit.jobId);
        latest = Math.min(scheduledJob.windowEnd, latest - scheduledJob.duration);
        if (i > index) latest -= visit.travel;
      }
      windows.push({ start: stop.start, latestStart: latest, jobsBefore: index });
      const delays = result.stops
        .filter((s) => s.jobId !== job.id)
        .map((s) => Math.max(0, s.start - (existing.get(s.jobId)?.start ?? s.start)));
      const candidate = {
        engineerId: engineer.id,
        name: engineer.name,
        availableAt: context.start,
        depart: stop.depart,
        arrival: stop.arrival,
        start: stop.start,
        end: stop.end,
        travel: stop.travel,
        estimated: stop.estimated,
        waitMinutes: Math.max(0, stop.start - state.time),
        delayedJobs: delays.filter((d) => d > 0).length,
        totalDelay: delays.reduce((sum, d) => sum + d, 0),
        extraTravel: result.drive - base.drive,
        extraKm: Math.round((result.km - base.km) * 10) / 10,
        jobsBefore: index,
        scheduledJobs: pending.length,
        activeJobId: context.locked?.jobId || null,
        timeline: {
          shiftStart: engineer.shiftStart,
          shiftEnd: engineer.shiftEnd,
          now: state.time,
          pausedUntil: engineer.pausedUntil || 0,
          current: describe([
            ...(context.locked ? [context.locked] : []),
            ...(route?.stops || []).filter((s) => pending.some((j) => j.id === s.jobId)),
          ]),
          proposed: describe([...(context.locked ? [context.locked] : []), ...result.stops]),
        },
      };
      if (!best || compare(candidate, best) < 0) best = candidate;
    }
    if (best) {
      best.timeline.windows = windows;
      candidates.push(best);
    } else excluded.schedule++;
  }
  candidates.sort(compare);
  return {
    revision: current.revision,
    jobId: job.id,
    candidates: candidates.slice(0, 3),
    feasibleCount: candidates.length,
    checkedCount: state.engineers.length,
    excluded,
    roadSource: travel.source,
    roadDetail: travel.detail,
  };
}

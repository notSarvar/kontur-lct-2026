import { contextFor, incompatibilities } from './evaluate.js';
import { legFunction } from './travel.js';
import { workloadBase } from '../domain/engineer-metrics.js';

export function ortoolsProblem(state, matrix, initial) {
  const leg = legFunction(matrix),
    jobs = state.jobs.filter((j) => j.status === 'pending');
  const index = new Map(jobs.map((j, i) => [j.id, i + 1]));
  const previous = Object.fromEntries(
    (state.plan?.routes || []).flatMap((r) => r.stops.map((s) => [s.jobId, r.engineerId])),
  );
  // CP-SAT uses integer seconds and metres. Up-round durations/travel and
  // down-round deadlines, then validate the result again with the JS evaluator.
  const up = (n) => Math.ceil(n * 60 - 1e-7),
    down = (n) => Math.floor(n * 60 + 1e-7);
  const normalized = jobs.map((j) => ({
    id: j.id,
    duration: up(j.duration),
    lo: up(j.windowStart),
    hi: down(j.windowEnd),
    urgent: j.priority === 'urgent',
    created: up(Math.max(j.createdAt ?? 0, j.windowStart)),
  }));
  const engineers = state.engineers.map((e, k) => {
    const context = contextFor(state, e),
      base = workloadBase(state, e, context);
    const candidates = jobs
      .map((j, i) => ({ j, i: i + 1 }))
      .filter(({ j }) => !incompatibilities(j, e).length);
    const arcs = [];
    for (const target of candidates) {
      for (const origin of [{ j: context.origin, i: 0 }, ...candidates]) {
        if (origin.i === target.i) continue;
        const trip = leg(origin.j, target.j, e);
        if (!Number.isFinite(trip.minutes) || !Number.isFinite(trip.km)) continue;
        const earliest = origin.i
          ? normalized[origin.i - 1].lo + normalized[origin.i - 1].duration
          : up(context.start);
        const arrival = earliest + up(trip.minutes),
          t = normalized[target.i - 1];
        if (arrival > t.hi || Math.max(arrival, t.lo) + t.duration > down(e.shiftEnd)) continue;
        arcs.push({
          from: origin.i,
          to: target.i,
          seconds: up(trip.minutes),
          metres: Math.round(trip.km * 1000),
        });
      }
    }
    return {
      id: e.id,
      start: up(context.start),
      end: down(e.shiftEnd),
      locked: Boolean(context.locked),
      baseWork: up(base.work),
      capacity: Math.max(1, Math.round(base.capacity * 60)),
      candidates: candidates.map(({ i, j }) => ({
        i,
        changed: Boolean(state.settings.stability && previous[j.id] && previous[j.id] !== e.id),
      })),
      arcs,
      initial: initial.routes[k].stops
        .filter((s) => index.has(s.jobId))
        .map((s) => ({ i: index.get(s.jobId), start: up(s.start) })),
    };
  });
  return {
    jobs: normalized,
    engineers,
    mode: state.settings.mode || 'economy',
    balanceWork: Boolean(state.settings.balanceWork),
    seconds: state.settings.ortoolsSeconds || 10,
    seed: (state.seed ?? 42) % 2147483647,
  };
}

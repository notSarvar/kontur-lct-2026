import { hasCoordinates } from './travel.js';

export function incompatibilities(job, engineer) {
  const reasons = [];
  if (!job.skills.every((k) => engineer.skills.includes(k))) reasons.push('qualification');
  if (!job.equipment.every((k) => engineer.equipment.includes(k))) reasons.push('equipment');
  if (
    engineer.transport === 'none' ||
    (job.requiredTransport !== 'any' && job.requiredTransport !== engineer.transport)
  )
    reasons.push('transport');
  if (job.pinnedEngineerId && job.pinnedEngineerId !== engineer.id) reasons.push('assignment');
  if (!hasCoordinates(job) || !hasCoordinates(engineer.position)) reasons.push('coordinates');
  return reasons;
}

export function contextFor(state, engineer) {
  const active = state.jobs.find(
    (j) => j.engineerId === engineer.id && ['enroute', 'working'].includes(j.status),
  );
  const locked = active?.lockedStop ? { ...active.lockedStop, locked: true, late: 0 } : null;
  if (locked) {
    if (active.status === 'working') {
      locked.start = active.actualStart;
      locked.end = active.actualStart + active.duration;
    }
    locked.end = Math.max(locked.end, state.time);
  }
  return {
    locked,
    origin: active || engineer.position,
    start: Math.max(state.time, engineer.shiftStart, engineer.pausedUntil || 0, locked?.end || 0),
  };
}

export function createEvaluator(state, leg, previous = {}) {
  const contexts = new Map(state.engineers.map((e) => [e.id, contextFor(state, e)]));
  const compatible = new Map(
    state.engineers.map((e) => [
      e.id,
      new Map(state.jobs.map((j) => [j.id, incompatibilities(j, e).length === 0])),
    ]),
  );
  const evaluate = (engineer, jobs) => {
    const context = contexts.get(engineer.id);
    let time = context.start,
      point = context.origin,
      drive = 0,
      km = 0,
      wait = 0,
      work = 0,
      changes = 0,
      urgentResponse = 0;
    const stops = [];
    for (const job of jobs) {
      if (!compatible.get(engineer.id).get(job.id)) return null;
      const trip = leg(point, job, engineer),
        arrival = time + trip.minutes;
      const start = Math.max(arrival, job.windowStart),
        end = start + job.duration;
      if (!Number.isFinite(end) || start > job.windowEnd || end > engineer.shiftEnd) return null;
      const response =
        job.priority === 'urgent' ? Math.max(0, start - Math.max(job.createdAt ?? 0, job.windowStart)) : 0;
      urgentResponse += response;
      stops.push({
        jobId: job.id,
        depart: time,
        arrival,
        start,
        end,
        travel: trip.minutes,
        km: trip.km,
        travelMode: trip.mode,
        estimated: trip.estimated,
        wait: start - arrival,
        late: 0,
        from: { lat: point.lat, lng: point.lng },
      });
      drive += trip.minutes;
      km += trip.km;
      wait += start - arrival;
      work += job.duration;
      if (previous[job.id] && previous[job.id] !== engineer.id) changes++;
      time = end;
      point = job;
    }
    return {
      engineerId: engineer.id,
      stops,
      origin: context.origin,
      locked: context.locked,
      drive,
      km,
      wait,
      work,
      changes,
      urgentResponse,
      late: 0,
      end: time,
      used: Boolean(stops.length || context.locked),
    };
  };
  evaluate.mode = state.settings.mode || 'economy';
  return evaluate;
}

export function routeCost(route, mode = 'economy') {
  const people = Number(route.used),
    response = route.urgentResponse;
  return [
    ...(mode === 'emergency' ? [response, people] : [people, response]),
    route.changes,
    route.km,
    route.drive,
  ];
}

export function objective(solution) {
  const totals = solution.routes.reduce(
    (sum, route) => {
      const cost = routeCost(route, solution.mode);
      return sum.map((value, i) => value + cost[i]);
    },
    [0, 0, 0, 0, 0],
  );
  return [
    solution.unassigned.filter((j) => j.priority === 'urgent').length,
    solution.unassigned.length,
    ...totals,
  ];
}
export function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-7) return a[i] < b[i] ? -1 : 1;
  return 0;
}
export const better = (a, b) => compare(objective(a), objective(b)) < 0;

// Time is measured in minutes. Travel/distance are reconstructed from the plan,
// not GPS observations. Work uses recorded start/end events when available.
const overlap = (a, b, lo, hi) => Math.max(0, Math.min(b, hi) - Math.max(a, lo));
const kinds = ['work', 'travel', 'wait', 'break', 'free'];

export function engineerMetrics(
  state,
  engineer,
  route = state.plan?.routes?.find((r) => r.engineerId === engineer.id),
) {
  const intervals = [],
    trips = [];
  const add = (kind, start, end) => {
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) intervals.push({ kind, start, end });
  };
  const stop = (s, start, end, cutoff = Infinity) => {
    if (!s) {
      if (start != null) add('work', start, Math.min(end, cutoff));
      return;
    }
    add('travel', s.depart, Math.min(s.arrival, cutoff));
    add('wait', s.arrival, Math.min(start ?? s.start, cutoff));
    if (start != null) add('work', start, Math.min(end, cutoff));
    trips.push({ start: s.depart, end: s.arrival, km: s.km || 0, cutoff, estimated: s.estimated !== false });
  };
  for (const job of state.jobs) {
    for (const a of job.attempts || []) if (a.engineerId === engineer.id) stop(a.stop, a.start, a.end, a.end);
    if (job.engineerId !== engineer.id || !['done', 'working', 'enroute'].includes(job.status)) continue;
    if (job.status === 'done') stop(job.lockedStop, job.actualStart, job.actualEnd, job.actualEnd);
    // In-progress visits come from the locked route, so they are counted once.
  }
  for (const s of route?.stops || []) {
    const job = state.jobs.find((j) => j.id === s.jobId);
    if (!job || job.status === 'done') continue;
    stop(s, job.actualStart ?? s.start, s.end);
  }
  const breaks = engineer.breaks || [];
  for (const b of breaks) add('break', b.start, b.end);
  if (!breaks.length && engineer.pausedUntil > state.time)
    add('break', Math.max(state.time, route?.locked?.end || 0), engineer.pausedUntil);
  const lo = engineer.shiftStart,
    hi = engineer.shiftEnd;
  const count = (from, to) => {
    const out = Object.fromEntries(kinds.map((k) => [k, 0]));
    if (to <= from) return { ...out, km: 0 };
    const bounds = [
      ...new Set([
        from,
        to,
        ...intervals.flatMap((i) => [
          Math.max(from, Math.min(to, i.start)),
          Math.max(from, Math.min(to, i.end)),
        ]),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 1; i < bounds.length; i++) {
      const a = bounds[i - 1],
        b = bounds[i];
      const kind =
        kinds.find((k) => intervals.some((v) => v.kind === k && v.start < b && v.end > a)) || 'free';
      out[kind] += b - a;
    }
    out.km = trips.reduce(
      (sum, t) =>
        sum +
        (t.end > t.start
          ? (t.km * overlap(t.start, Math.min(t.end, t.cutoff), from, to)) / (t.end - t.start)
          : 0),
      0,
    );
    return out;
  };
  const now = Math.max(lo, Math.min(hi, state.time));
  const past = count(lo, now),
    remaining = count(now, hi),
    projected = count(lo, hi);
  const capacity = Math.max(1, hi - lo - projected.break);
  const history = engineer.workHistory || { workMinutes: 0, availableMinutes: 0, label: '' };
  const historyKnown = history.availableMinutes > 0;
  return {
    engineerId: engineer.id,
    past,
    remaining,
    projected,
    capacity,
    utilization: projected.work / capacity,
    historicalUtilization: historyKnown ? history.workMinutes / history.availableMinutes : null,
    cumulativeUtilization: (history.workMinutes + projected.work) / (history.availableMinutes + capacity),
    history,
    historyKnown,
    distanceSource: !trips.length ? 'none' : trips.some((t) => t.estimated) ? 'estimate' : 'road',
    workSource: state.dataset || state.seed != null ? 'simulation' : 'recorded',
  };
}

export function workloadBase(state, engineer, context) {
  const lockedRoute = { stops: context.locked ? [context.locked] : [], locked: context.locked };
  const m = engineerMetrics(state, engineer, lockedRoute);
  return {
    work: m.history.workMinutes + m.projected.work,
    capacity: m.history.availableMinutes + m.capacity,
  };
}

export function balanceCost(base, futureWork) {
  // Convex penalty: its marginal cost grows with accumulated work / available time.
  return Math.round((100 * (base.work + futureWork) ** 2) / Math.max(1, base.capacity));
}

export function attachEngineerMetrics(state) {
  if (!state.plan) return;
  state.plan.engineerMetrics = state.engineers.map((e) => engineerMetrics(state, e));
}

import { openKitShortage } from '../../shared/kit-shortage.js';
// Gaps in the current plan, not a promise that a new visit (including travel) fits.
export function freeWindows(state, engineer, minimum = 30) {
  if (
    engineer.shiftWithdrawn ||
    openKitShortage(state, engineer.id) ||
    engineer.transport === 'none' ||
    state.jobs.some((j) => j.engineerId === engineer.id && j.status === 'blocked')
  )
    return [];
  const start = Math.max(state.time, engineer.shiftStart, engineer.pausedUntil || 0);
  const end = engineer.shiftEnd;
  const route = state.plan.routes.find((r) => r.engineerId === engineer.id);
  const occupied = (route?.stops || [])
    .map((s) => ({ start: s.depart ?? s.start, end: s.end }))
    .sort((a, b) => a.start - b.start);
  const windows = [];
  let cursor = start;
  for (const interval of occupied) {
    const until = Math.min(interval.start, end);
    if (until - cursor >= minimum) windows.push({ start: cursor, end: until });
    cursor = Math.max(cursor, interval.end);
    if (cursor >= end) break;
  }
  if (end - cursor >= minimum) windows.push({ start: cursor, end });
  return windows;
}

export function engineerStatus(state, engineer) {
  if (engineer.shiftWithdrawn) return { label: 'Снят со смены', tone: 'muted' };
  if (openKitShortage(state, engineer.id)) return { label: 'Комплект под риском', tone: 'problem' };
  const route = state.plan.routes.find((r) => r.engineerId === engineer.id);
  const hasIssue =
    state.jobs.some((j) => j.engineerId === engineer.id && j.status === 'blocked') ||
    route?.stops.some((s) => s.late > 0);
  if (hasIssue) return { label: 'Нужна помощь', tone: 'problem' };
  if (engineer.transport === 'none') return { label: 'Недоступен', tone: 'muted' };
  if (state.time < engineer.shiftStart) return { label: 'Смена не началась', tone: 'muted' };
  if (state.time >= engineer.shiftEnd) return { label: 'Смена завершена', tone: 'muted' };
  if (engineer.pausedUntil > state.time) return { label: 'Перерыв', tone: 'muted' };
  const current = state.jobs.find(
    (j) => j.engineerId === engineer.id && ['working', 'enroute'].includes(j.status),
  );
  if (current) return { label: current.status === 'working' ? 'На объекте' : 'В пути', tone: 'normal' };
  if (freeWindows(state, engineer).some((w) => w.start === state.time))
    return { label: 'Есть свободное окно', tone: 'normal' };
  return { label: 'По плану', tone: 'normal' };
}

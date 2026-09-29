import { addEvent } from './scenario.js';
// Server timestamps are authoritative; simulation measurements remain explicitly separate.
export function startWorkTimer(job, source = 'manual', now = Date.now()) {
  job.workTimer = { source, startedAt: now, startMinute: job.actualStart };
}
export function finishWorkTimer(state, job, engineerId, outcome, now = Date.now()) {
  const timer = job.workTimer || { source: 'simulation', startMinute: job.actualStart };
  const seconds =
    timer.source === 'manual'
      ? Math.max(0, Math.floor((now - timer.startedAt) / 1000))
      : Math.max(0, Math.round((state.time - timer.startMinute) * 60));
  const record = {
    type: 'engineer.work.duration',
    engineerId,
    jobId: job.id,
    time: state.time,
    source: timer.source,
    startedAt: timer.startedAt ?? null,
    endedAt: now,
    startMinute: timer.startMinute,
    endMinute: state.time,
    durationSeconds: seconds,
    normSeconds: job.duration * 60,
    deviationSeconds: seconds - job.duration * 60,
    outcome,
  };
  job.workTimer = { ...timer, endedAt: now, durationSeconds: seconds };
  state.history.push(record);
  const minutes = (seconds / 60).toFixed(1);
  addEvent(
    state,
    'Время работы зафиксировано',
    `№${job.number} · ${minutes} мин · норматив ${job.duration} мин · ${timer.source === 'manual' ? 'фактическое время' : 'симуляция'}`,
    engineerId,
    'success',
  );
  return record;
}

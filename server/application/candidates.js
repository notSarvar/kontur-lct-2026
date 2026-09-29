import { applyAction } from './actions.js';

const allowed = new Set([
  'engineer.kit.resolve',
  'job.assign',
  'job.save',
  'job.resolve',
  'job.delete',
  'engineer.save',
  'engineer.pause',
  'settings',
  'optimize',
  'office.save',
  'geography.confirm',
]);
export const conflict = (message, code = 'VERSION_CONFLICT') =>
  Object.assign(new Error(message), { status: 409, code });

export async function previewAction(current, action, options = {}) {
  if (!allowed.has(action?.type))
    throw Object.assign(new Error('Это действие не поддерживает предпросмотр'), { status: 400 });
  if (action.expectedRevision !== current.revision)
    throw conflict('План уже изменился. Обновите экран и пересчитайте вариант.');
  const after = await applyAction(current, action, options);
  const violations = [];
  // A requested assignment must actually be present, rather than silently dropped.
  const required = current.jobs
    .filter((job) => job.pinnedEngineerId && job.engineerId && job.status === 'pending')
    .map((j) => j.id);
  if (action.type === 'job.assign' && action.payload.engineerId) required.push(action.payload.id);
  if (action.type === 'job.resolve' && action.payload.pinnedEngineerId) required.push(action.payload.id);
  for (const id of new Set(required)) {
    const job = after.jobs.find((j) => j.id === id);
    if (job?.pinnedEngineerId && job.engineerId !== job.pinnedEngineerId)
      violations.push({
        code: 'LOCK_CONFLICT',
        jobId: id,
        message: `№${job.number}: выбранный инженер не может выполнить визит с текущими ограничениями.`,
      });
  }
  return {
    id: crypto.randomUUID(),
    baseRevision: current.revision,
    createdAt: new Date().toISOString(),
    before: structuredClone(current),
    after,
    diff: after.plan.diff,
    actionType: action.type,
    validation: { passed: violations.length === 0, violations },
    canApply: violations.length === 0,
  };
}

export function activateCandidate(current, candidate, expectedRevision) {
  if (!candidate)
    throw conflict(
      'Предпросмотр истёк или сервер перезапущен. Рассчитайте вариант заново.',
      'CANDIDATE_EXPIRED',
    );
  if (expectedRevision !== current.revision || candidate.baseRevision !== current.revision)
    throw conflict('План изменился после предпросмотра. Старый вариант нельзя применить; рассчитайте новый.');
  if (!candidate.canApply)
    throw conflict('Вариант содержит конфликт закрепления. Выберите другого инженера.', 'INVALID_CANDIDATE');
  const next = structuredClone(candidate.after);
  next.revision = current.revision + 1;
  next.history.push({
    type: 'plan.applied',
    time: next.time,
    candidateId: candidate.id,
    baseRevision: current.revision,
    actionType: candidate.actionType,
    diff: candidate.diff,
  });
  return next;
}

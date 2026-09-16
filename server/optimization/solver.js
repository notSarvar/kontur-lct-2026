import { legFunction, hasCoordinates } from './travel.js';
import { createEvaluator, incompatibilities, better, objective } from './evaluate.js';
import { baseline, emptySolution, repair, improve } from './search.js';
export { incompatibilities, contextFor } from './evaluate.js';
export { haversine, pointKey, estimatedTravel, travelFunction } from './travel.js';

export function solve(state, matrix = {}, options = {}) {
  const started = performance.now(),
    previous = {};
  for (const route of state.plan?.routes || [])
    for (const stop of route.stops) previous[stop.jobId] = route.engineerId;
  const evaluate = createEvaluator(state, legFunction(matrix), state.settings.stability ? previous : {});
  const pending = state.jobs.filter((j) => j.status === 'pending');
  const reference = baseline(pending, state.engineers, evaluate);
  const sorted = [...pending].sort(
    (a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.windowEnd - b.windowEnd,
  );
  const greedy = repair(emptySolution(state.engineers, evaluate), sorted, state.engineers, evaluate, false);
  let best = better(greedy, reference) ? greedy : reference;
  const regret = repair(emptySolution(state.engineers, evaluate), sorted, state.engineers, evaluate, true);
  if (better(regret, best)) best = regret;
  const result = improve(best, pending, state.engineers, evaluate, {
    seed: state.seed,
    iterations: options.iterations ?? 60,
  });
  best = result.solution;

  function reason(job) {
    if (!hasCoordinates(job))
      return { code: 'coordinates', text: 'Адрес требует проверки: выберите точку объекта на карте.' };
    const compatible = state.engineers.filter((e) => incompatibilities(job, e).length === 0);
    if (job.pinnedEngineerId && !compatible.length)
      return {
        code: 'assignment',
        text: 'Выбранный вручную инженер не подходит по навыку, транспорту, оборудованию или координатам. Измените назначение.',
      };
    if (!compatible.length) {
      if (!state.engineers.some((e) => job.skills.every((k) => e.skills.includes(k))))
        return { code: 'qualification', text: 'Нет инженера с нужной квалификацией.' };
      if (
        !state.engineers.some(
          (e) =>
            job.skills.every((k) => e.skills.includes(k)) &&
            job.equipment.every((k) => e.equipment.includes(k)),
        )
      )
        return { code: 'equipment', text: 'Нет подходящего инженера с требуемым оборудованием.' };
      if (state.engineers.some((e) => !hasCoordinates(e.position)))
        return {
          code: 'coordinates',
          text: 'У инженеров не подтверждена начальная точка. Укажите координаты офиса.',
        };
      return { code: 'transport', text: 'Подходящие инженеры недоступны или не имеют нужного транспорта.' };
    }
    if (state.time > job.windowEnd)
      return {
        code: 'expired',
        text: 'Клиентское окно уже закончилось. Необходимо согласовать новое время.',
      };
    if (!compatible.some((e) => evaluate(e, [job])))
      return {
        code: 'window',
        text: 'Даже отдельный визит не помещается в окно или смену с учётом дороги и текущих работ.',
      };
    return {
      code: 'capacity',
      text: 'Алгоритм не нашёл места в текущем плане без нарушения окон. Проверьте ресурсы или согласуйте другое время; это не доказательство отсутствия решения.',
    };
  }
  const byId = Object.fromEntries(state.jobs.map((j) => [j.id, j]));
  const routes = best.routes.map((route) => ({
    ...route,
    remainingDrive: route.drive + (route.locked ? Math.max(0, route.locked.arrival - state.time) : 0),
    totalKm: route.km + (route.locked?.km || 0),
    stops: [...(route.locked ? [route.locked] : []), ...route.stops],
    explanations: route.stops.map((s) => ({
      jobId: s.jobId,
      text: `Навык подходит; начало ${clock(s.start)} в окне ${clock(byId[s.jobId].windowStart)}–${clock(byId[s.jobId].windowEnd)}; работа заканчивается в смену. Дорога ${s.travel} мин.`,
      changed: Boolean(previous[s.jobId] && previous[s.jobId] !== route.engineerId),
    })),
  }));
  const oldStops = Object.fromEntries(
    (state.plan?.routes || []).flatMap((r) =>
      r.stops.map((s, index) => [s.jobId, { ...s, index, engineerId: r.engineerId }]),
    ),
  );
  const changes = routes.flatMap((r) =>
    r.stops.flatMap((s, index) => {
      const old = oldStops[s.jobId];
      if (!old || (old.engineerId === r.engineerId && old.start === s.start && old.index === index))
        return [];
      return [
        {
          jobId: s.jobId,
          before: { engineerId: old.engineerId, start: old.start, index: old.index },
          after: { engineerId: r.engineerId, start: s.start, index },
        },
      ];
    }),
  );
  const held = state.jobs.filter((j) => j.status === 'manual_review');
  const nextIds = new Set(routes.flatMap((r) => r.stops.map((s) => s.jobId)));
  for (const [id, old] of Object.entries(oldStops)) {
    if (!nextIds.has(id) && ['pending', 'manual_review'].includes(byId[id]?.status))
      changes.push({
        jobId: id,
        before: { engineerId: old.engineerId, start: old.start, index: old.index },
        after: null,
      });
  }
  const unassigned = [
    ...best.unassigned.map((j) => ({ jobId: j.id, ...reason(j) })),
    ...held.map((j) => ({
      jobId: j.id,
      code: j.reviewReason?.code || 'manual',
      text: j.reviewReason?.text || 'Ожидает согласования диспетчером.',
    })),
  ];
  const droppedIds = best.unassigned
    .map((j) => j.id)
    .sort()
    .join(',');
  const total = (solution, key) => solution.routes.reduce((s, r) => s + r[key], 0);
  return {
    routes,
    unassigned,
    changes,
    objective: objective(best),
    diagnostics: result.diagnostics,
    baseline: { routes: reference.routes, unassigned: reference.unassigned.map((j) => j.id) },
    metrics: {
      assigned: routes.reduce((s, r) => s + r.stops.length, 0),
      unassigned: unassigned.length,
      usedEngineers: routes.filter((r) => r.stops.length).length,
      km: routes.reduce((s, r) => s + r.totalKm, 0),
      pendingKm: total(best, 'km'),
      travel: routes.reduce((s, r) => s + r.remainingDrive, 0),
      pendingTravel: total(best, 'drive'),
      work: total(best, 'work'),
      changes: changes.length,
      late: 0,
      lateMinutes: 0,
      urgentResponse: total(best, 'urgentResponse'),
      baselineTravel: total(reference, 'drive'),
      baselineKm: total(reference, 'km'),
      baselineUsedEngineers: reference.routes.filter((r) => r.used).length,
      baselineAssigned: pending.length - reference.unassigned.length,
      comparable:
        droppedIds ===
        reference.unassigned
          .map((j) => j.id)
          .sort()
          .join(','),
      computeMs: Math.round(performance.now() - started),
    },
    algorithm:
      'ALNS: regret-2 вставка, случайное и связанное удаление, освобождение маршрута; адаптивный выбор операций. Эвристика без гарантии глобального оптимума.',
    at: state.time,
    computedAt: new Date().toISOString(),
  };
}
const clock = (n) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;

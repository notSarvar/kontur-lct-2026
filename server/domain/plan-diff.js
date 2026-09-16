const snapshot = (state) => {
  const stops = new Map(
    (state.plan?.routes || []).flatMap((route) =>
      route.stops.map((stop, index) => [
        stop.jobId,
        { engineerId: route.engineerId, index, start: stop.start, end: stop.end },
      ]),
    ),
  );
  return new Map(
    state.jobs.map((job) => [
      job.id,
      {
        ...stops.get(job.id),
        status: job.status,
        pinnedEngineerId: job.pinnedEngineerId || null,
        windowStart: job.windowStart,
        windowEnd: job.windowEnd,
        lat: job.lat,
        lng: job.lng,
        duration: job.duration,
        priority: job.priority,
        title: job.title,
        address: job.address,
        skills: job.skills,
        equipment: job.equipment,
        requiredTransport: job.requiredTransport,
      },
    ]),
  );
};

export function diffPlans(before, after) {
  const old = snapshot(before),
    next = snapshot(after);
  const beforeJobs = new Map(before.jobs.map((j) => [j.id, j]));
  const afterJobs = new Map(after.jobs.map((j) => [j.id, j]));
  const jobChanges = [];
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const a = old.get(id),
      b = next.get(id),
      kinds = [];
    if (!a) kinds.push('added');
    else if (!b) kinds.push('removed');
    else {
      if (!a.engineerId && b.engineerId) kinds.push('assigned');
      if (a.engineerId && !b.engineerId && b.status !== 'done') kinds.push('unassigned');
      if (a.engineerId && b.engineerId && a.engineerId !== b.engineerId) kinds.push('reassigned');
      if (a.engineerId && b.engineerId && a.index !== b.index) kinds.push('reordered');
      if (a.engineerId && b.engineerId && (a.start !== b.start || a.end !== b.end)) kinds.push('retimed');
      if (a.pinnedEngineerId !== b.pinnedEngineerId) kinds.push('lock');
      if (a.status !== b.status) kinds.push('status');
      if (
        [
          'windowStart',
          'windowEnd',
          'lat',
          'lng',
          'duration',
          'priority',
          'title',
          'address',
          'skills',
          'equipment',
          'requiredTransport',
        ].some((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
      )
        kinds.push('updated');
    }
    if (kinds.length) {
      const job = afterJobs.get(id) || beforeJobs.get(id);
      jobChanges.push({
        jobId: id,
        number: job.number,
        title: job.title,
        kinds,
        before: a || null,
        after: b || null,
      });
    }
  }
  const routeSnapshot = (state) =>
    new Map(
      (state.plan?.routes || []).map((route) => [
        route.engineerId,
        {
          stops: route.stops.map((stop) => ({ jobId: stop.jobId, start: stop.start, end: stop.end })),
          km: route.totalKm ?? route.km,
          travel: route.remainingDrive ?? route.drive,
          geometry: route.geometry || [],
          roadGeometry: route.roadGeometry || false,
          segments: route.segments || [],
        },
      ]),
    );
  const oldRoutes = routeSnapshot(before),
    newRoutes = routeSnapshot(after),
    routeChanges = [];
  for (const engineerId of new Set([...oldRoutes.keys(), ...newRoutes.keys()])) {
    const a = oldRoutes.get(engineerId) || null,
      b = newRoutes.get(engineerId) || null;
    if (JSON.stringify(a) !== JSON.stringify(b)) routeChanges.push({ engineerId, before: a, after: b });
  }
  const metrics = (state) => ({
    total: state.jobs.filter((j) => !['done', 'blocked'].includes(j.status)).length,
    assigned: state.plan?.metrics.assigned || 0,
    unassigned: state.plan?.metrics.unassigned || 0,
    engineers: state.plan?.metrics.usedEngineers || 0,
    km: state.plan?.metrics.km || 0,
    urgentResponse: state.plan?.metrics.urgentResponse || 0,
  });
  const policy = (state) => ({
    mode: state.settings.mode || 'economy',
    roadSource: state.plan?.roadSource,
    matrixId: state.plan?.matrixId,
    roadDetail: state.plan?.roadDetail,
  });
  return {
    jobChanges,
    routeChanges,
    policy: { before: policy(before), after: policy(after) },
    metrics: { before: metrics(before), after: metrics(after) },
    summary: Object.fromEntries(
      [
        'added',
        'removed',
        'assigned',
        'unassigned',
        'reassigned',
        'reordered',
        'retimed',
        'lock',
        'updated',
        'status',
      ].map((kind) => [kind, jobChanges.filter((c) => c.kinds.includes(kind)).length]),
    ),
  };
}

export function attachDiff(before, after) {
  after.plan.diff = diffPlans(before, after);
  after.plan.changes = after.plan.diff.jobChanges;
  after.plan.metrics.changes = after.plan.changes.length;
}

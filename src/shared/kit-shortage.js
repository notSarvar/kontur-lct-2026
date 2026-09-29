// Keys use the exact material/tool requirement from the assigned SOP copy.
export const kitKeysForJob = (job) =>
  ['materials', 'tools'].flatMap((kind) =>
    (job.sop?.[kind] || []).map((text) => JSON.stringify([kind, text])),
  );
export const openKitShortage = (state, engineerId) =>
  (state.support || []).find(
    (ticket) =>
      ticket.kind === 'kit_shortage' && ticket.engineerId === engineerId && ticket.status === 'open',
  );
export const affectedKitJobs = (state, engineerId, missing) => {
  const keys = new Set(missing.map((item) => item.key));
  return state.jobs.filter(
    (job) =>
      job.engineerId === engineerId &&
      job.status === 'pending' &&
      kitKeysForJob(job).some((key) => keys.has(key)),
  );
};

// Shared by the phone and server: checks refer to the actual assigned SOP copies.
export function shiftKit(state, engineer) {
  const groups = new Map();
  const jobs = state.jobs.filter(
    (j) => j.engineerId === engineer.id && !['manual_review', 'blocked'].includes(j.status),
  );
  for (const job of jobs) {
    for (const kind of ['materials', 'tools']) {
      for (const text of job.sop?.[kind] || []) {
        const key = JSON.stringify([kind, text]);
        if (!groups.has(key)) groups.set(key, { key, kind, text, jobs: [], sources: new Set() });
        const item = groups.get(key);
        item.jobs.push(job.id);
        const code = job.sop.source?.file?.match(/^(\d+)_/)?.[1];
        item.sources.add(code ? `SOP ${code}` : job.sop.title);
      }
    }
  }
  const items = [...groups.values()].map((item) => {
    const match =
      item.kind === 'materials' &&
      item.text.match(/^(.*?) — (\d+)\s*(шт\.|м|точек)(?:\s*\+\s*(\d+)(?:\s*м)?\s*резерв)?(.*)$/);
    const count = item.jobs.length;
    const signature = item.kind === 'materials' ? JSON.stringify(item.jobs.sort()) : item.key;
    return {
      ...item,
      sources: [...item.sources],
      label: match ? match[1] : item.text,
      detail: match ? match[5].replace(/^;\s*/, '') : '',
      quantity: match
        ? `${(Number(match[2]) + Number(match[4] || 0)) * count} ${match[3]}`
        : item.kind === 'tools'
          ? 'на смену'
          : `${count} визит(а)`,
      signature,
      done: state.settings?.autoChecklists !== false || engineer.kitChecks?.[item.key] === signature,
    };
  });
  return {
    items,
    checked: items.filter((i) => i.done).length,
    ready: items.every((i) => i.done),
    uncovered: jobs.filter((j) => !j.sop).length,
  };
}
export function sopReady(job) {
  return !job.sop || (job.sop.prerequisitesConfirmed && job.sop.steps.every((step) => step.done));
}

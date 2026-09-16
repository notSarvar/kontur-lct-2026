import fs from 'node:fs/promises';
import { createOfficialScenario } from '../server/domain/official-scenario.js';
import { solve } from '../server/optimization/solver.js';
const report = [];
for (const id of ['east', 'southeast', 'southcenter']) {
  const state = await createOfficialScenario(id),
    plan = solve(state, {}, { iterations: 100 });
  const m = plan.metrics;
  report.push({
    region: state.dataset.name,
    jobs: state.jobs.length,
    pool: state.engineers.length,
    geocoded: state.jobs.filter((j) => Number.isFinite(j.lat)).length,
    officeCoordinatesAvailable: Number.isFinite(state.dataset.office.lat),
    officeApproximate: Boolean(state.dataset.office.approximate),
    assigned: m.assigned,
    baselineAssigned: m.baselineAssigned,
    engineers: m.usedEngineers,
    baselineEngineers: m.baselineUsedEngineers,
    km: +m.km.toFixed(2),
    baselineKm: +m.baselineKm.toFixed(2),
    sameJobs: m.comparable,
    milliseconds: m.computeMs,
    unassignedReasons: plan.unassigned.reduce((a, x) => ((a[x.code] = (a[x.code] || 0) + 1), a), {}),
  });
}
console.table(report.map(({ unassignedReasons, ...row }) => row));
await fs.writeFile(
  new URL('../docs/benchmark.json', import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      travel: 'Estimated walking + public transit, not actual network routes',
      iterations: 100,
      results: report,
    },
    null,
    2,
  ) + '\n',
);

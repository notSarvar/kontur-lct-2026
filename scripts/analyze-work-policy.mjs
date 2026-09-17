import fs from 'node:fs/promises';
import { loadOfficialDatasets } from '../server/infrastructure/datasets.js';
import { createOfficialScenario } from '../server/domain/official-scenario.js';
import { OFFICIAL_POLICY } from '../server/domain/official-policy.js';
import { getTravel } from '../server/infrastructure/routing.js';
import { solve } from '../server/optimization/solver.js';
const datasets = await loadOfficialDatasets();
const report = {
  generatedAt: new Date().toISOString(),
  policy: OFFICIAL_POLICY,
  counts: datasets.map((d) => ({
    region: d.id,
    jobs: d.jobs.length,
    emergency: d.jobs.filter((j) => j.type === 'emergency').length,
    information: d.jobs.filter((j) => j.type === 'information').length,
    broadEmergencies: d.jobs.filter((j) => j.type === 'emergency' && j.windowEnd - j.windowStart >= 1200)
      .length,
    shortEmergencies: d.jobs.filter((j) => j.type === 'emergency' && j.windowEnd - j.windowStart < 1200)
      .length,
    monitoring: d.jobs.filter((j) => j.title === 'Мониторинг').length,
  })),
  sensitivity: {
    method:
      'Fixed derived roster per region, same prepared walking matrix and estimated transit, economy mode, 100 iterations. Only information service minutes change. Alternative values are hypotheses, not Excel norms.',
    results: [],
  },
};
for (const dataset of datasets.filter((d) => d.jobs.some((j) => j.type === 'information'))) {
  const base = await createOfficialScenario(dataset.id);
  base.settings.roadMode = 'prepared';
  base.settings.mode = 'economy';
  const travel = await getTravel(base);
  for (const minutes of [20, 30, 50]) {
    const state = structuredClone(base);
    for (const job of state.jobs.filter((j) => j.type === 'information')) job.duration = minutes;
    const plan = solve(state, travel.matrix, { iterations: 100 }),
      m = plan.metrics;
    report.sensitivity.results.push({
      region: dataset.id,
      informationServiceMinutes: minutes,
      pool: state.engineers.length,
      assigned: m.assigned,
      usedEngineers: m.usedEngineers,
      km: Number(m.km.toFixed(2)),
      matrixId: travel.matrixId,
      plannedServiceMinutes: plan.routes.flatMap((r) => r.stops).reduce((sum, s) => sum + s.end - s.start, 0),
      assignment: plan.routes.flatMap((r) =>
        r.stops.map((s) => ({ jobId: s.jobId, engineerId: r.engineerId, start: s.start, end: s.end })),
      ),
    });
  }
}
await fs.writeFile(
  new URL('../docs/work-policy-analysis.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(report.counts);
console.table(report.sensitivity.results.map(({ assignment, matrixId, ...r }) => r));

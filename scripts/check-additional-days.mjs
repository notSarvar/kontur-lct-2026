// Read-only, offline validation of the packaged independent datasets and travel bundles.
import assert from 'node:assert/strict';
import { loadOfficialDatasets } from '../server/infrastructure/datasets.js';
import { createOfficialScenario } from '../server/domain/official-scenario.js';
import { replan } from '../server/application/planning.js';
const rows = [];
for (const dataset of (await loadOfficialDatasets()).filter((d) => d.baseRegion)) {
  const state = await createOfficialScenario(dataset.id);
  const base = await createOfficialScenario(dataset.baseRegion);
  assert.deepEqual(state.dataset.office, base.dataset.office);
  state.settings.roadMode = 'prepared';
  await replan(state, { iterations: 60 });
  assert.equal(state.plan.roadSource, 'prepared');
  assert.equal(state.plan.metrics.assigned + state.plan.metrics.unassigned, dataset.count);
  assert.ok(state.plan.metrics.assigned > 0);
  assert.equal(
    new Set(state.plan.routes.flatMap((r) => r.stops.map((s) => s.jobId))).size,
    state.plan.metrics.assigned,
  );
  rows.push({
    id: dataset.id,
    date: dataset.date,
    jobs: state.jobs.length,
    geocoded: state.jobs.filter((j) => Number.isFinite(j.lat) && Number.isFinite(j.lng)).length,
    engineers: state.engineers.length,
    assigned: state.plan.metrics.assigned,
    unassigned: state.plan.metrics.unassigned,
    matrixId: state.plan.matrixId,
  });
}
assert.equal(rows.length, 6);
console.log(JSON.stringify(rows, null, 2));

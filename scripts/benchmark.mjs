import fs from 'node:fs/promises';
import { OFFICIAL_POLICY } from '../server/domain/official-policy.js';
import { createOfficialScenario } from '../server/domain/official-scenario.js';
import { solve } from '../server/optimization/solver.js';
import { getTravel } from '../server/infrastructure/routing.js';
const report = [];
for (const roadMode of ['estimate', 'prepared'])
  for (const mode of ['economy', 'emergency'])
    for (const id of ['east', 'southeast', 'southcenter']) {
      const state = await createOfficialScenario(id);
      state.settings = { ...state.settings, mode, roadMode };
      const travel = await getTravel(state);
      const plan = solve(state, travel.matrix, { iterations: 100 });
      const m = plan.metrics;
      report.push({
        region: state.dataset.name,
        mode,
        roadMode,
        matrixId: travel.matrixId || null,
        urgentWaiting: plan.metrics.urgentResponse,
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
  new URL('../docs/benchmark-v3.json', import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      policy: OFFICIAL_POLICY,
      travel:
        'estimate: approximate walking/transit; prepared: cached foot routing + estimated public transit. No transit schedules.',
      iterations: 100,
      results: report,
    },
    null,
    2,
  ) + '\n',
);

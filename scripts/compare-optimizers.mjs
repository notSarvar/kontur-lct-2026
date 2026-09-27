import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createOfficialScenario } from '../server/domain/official-scenario.js';
import { compareSolvers, solveSelected } from '../server/optimization/runner.js';
import { optimizerSettings } from '../server/optimization/settings.js';
import { compare } from '../server/optimization/evaluate.js';
const results = [];
for (const balanceWork of [false, true])
  for (const id of ['east', 'southeast', 'southcenter']) {
    const state = await createOfficialScenario(id);
    state.settings = { ...state.settings, ...optimizerSettings({ balanceWork }), stability: false };
    const input = {
      jobs: state.jobs,
      engineers: state.engineers,
      settings: state.settings,
      time: state.time,
    };
    const inputSha256 = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const result = await compareSolvers(state, {}, { ortoolsSeconds: 10 });
    const extendedState = structuredClone(state);
    Object.assign(extendedState.settings, { solver: 'alns', alnsIterations: 300, alnsRestarts: 3 });
    const extended = await solveSelected(extendedState, {});
    results.push({
      region: id,
      name: state.dataset.name,
      jobs: state.jobs.length,
      pool: state.engineers.length,
      inputSha256,
      ...result,
      extendedAlns: {
        metrics: extended.metrics,
        objective: extended.objective,
        diagnostics: extended.diagnostics,
        jobIds: extended.routes.flatMap((r) => r.stops.map((s) => s.jobId)).sort(),
      },
      winner:
        compare(result.alns.objective, result.ortools.objective) < 0
          ? 'alns'
          : compare(result.alns.objective, result.ortools.objective) > 0
            ? 'ortools'
            : 'tie',
    });
    console.log(
      JSON.stringify({
        id,
        balanceWork,
        alns: result.alns.objective,
        ortools: result.ortools.objective,
        extended: extended.objective,
        ortoolsStatus: result.ortools.diagnostics.stages.map((s) => s.status),
        sameJobs: result.sameAssignedJobs,
      }),
    );
  }
const report = {
  generatedAt: new Date().toISOString(),
  description:
    'Only official synthetic inputs. Fresh 08:00 snapshots, fixed generated rosters, no prior history, no previous assignments, economy objective. Estimated walking/transit matrix shared across solvers. Open routes. ALNS 60x1 and 300x3; OR-Tools CP-SAT 10 s. Wall-clock-limited results can vary across machines/runs. Missing coordinates remain unresolved. All outputs use the same JS feasibility validator.',
  results,
};
await fs.writeFile(
  new URL('../docs/benchmark-optimizers.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);

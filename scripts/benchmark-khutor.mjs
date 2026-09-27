import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { solveSelected } from '../server/optimization/runner.js';
import { createEvaluator, objective } from '../server/optimization/evaluate.js';
import { legFunction } from '../server/optimization/travel.js';
import { root } from './khutor-data.mjs';
const bytes = await fs.readFile(new URL('scenario.json', root));
const original = JSON.parse(bytes);
const mode = process.argv[2] || 'alns';
const params =
  mode === 'ortools'
    ? { solver: mode, ortoolsSeconds: Number(process.argv[3] || 60) }
    : {
        solver: 'alns',
        alnsIterations: Number(process.argv[3] || 60),
        alnsRestarts: Number(process.argv[4] || 1),
      };
const state = structuredClone(original);
Object.assign(state.settings, params);
const name =
  params.solver === 'ortools'
    ? `ortools-${params.ortoolsSeconds}s`
    : `alns-${params.alnsIterations}x${params.alnsRestarts}`;
const started = performance.now();
console.log(
  JSON.stringify({ event: 'start', name, jobs: state.jobs.length, engineers: state.engineers.length }),
);
try {
  const plan = await solveSelected(state, {});
  const evaluate = createEvaluator(state, legFunction()),
    seen = new Set();
  const routes = plan.routes.map((r, i) => {
    const jobs = r.stops.map((s) => {
      if (seen.has(s.jobId)) throw new Error('Duplicate assignment');
      seen.add(s.jobId);
      const j = state.jobs.find((j) => j.id === s.jobId);
      if (!j) throw new Error('Unknown job');
      return j;
    });
    const checked = evaluate(state.engineers[i], jobs);
    if (!checked) throw new Error('Invalid route');
    return checked;
  });
  const unassigned = state.jobs.filter((j) => !seen.has(j.id));
  if (
    JSON.stringify(objective({ mode: state.settings.mode, routes, unassigned })) !==
    JSON.stringify(plan.objective)
  )
    throw new Error('Objective mismatch');
  const output = {
    name,
    generatedAt: new Date().toISOString(),
    inputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    settings: state.settings,
    wallMs: Math.round(performance.now() - started),
    metrics: plan.metrics,
    objective: plan.objective,
    diagnostics: plan.diagnostics,
    assignedIds: [...seen].sort(),
    unassigned: plan.unassigned,
    routes: plan.routes.map((r) => ({
      engineerId: r.engineerId,
      km: r.km,
      work: r.work,
      drive: r.drive,
      wait: r.wait,
      stops: r.stops,
    })),
    baseline: {
      assigned: plan.metrics.baselineAssigned,
      engineers: plan.metrics.baselineUsedEngineers,
      km: plan.metrics.baselineKm,
      travel: plan.metrics.baselineTravel,
    },
    validation:
      'All routes independently reevaluated with common JS evaluator, no duplicate/lost jobs, objective recomputed',
  };
  await fs.writeFile(new URL(`${name}.json`, root), JSON.stringify(output, null, 2) + '\n');
  console.log(
    JSON.stringify({
      event: 'done',
      name,
      wallMs: output.wallMs,
      objective: output.objective,
      metrics: output.metrics,
      diagnostics: output.diagnostics,
    }),
  );
} catch (error) {
  const output = {
    name,
    generatedAt: new Date().toISOString(),
    inputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    settings: state.settings,
    wallMs: Math.round(performance.now() - started),
    error: error.message,
  };
  await fs.writeFile(new URL(`${name}.json`, root), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output));
  process.exitCode = 1;
}

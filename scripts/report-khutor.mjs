import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { root } from './khutor-data.mjs';
import { createEvaluator, compare } from '../server/optimization/evaluate.js';
import { legFunction } from '../server/optimization/travel.js';
import { baseline } from '../server/optimization/search.js';
const read = async (name) => JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));
const bytes = await fs.readFile(new URL('scenario.json', root));
const inputSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const state = JSON.parse(bytes),
  source = await read('source.json'),
  assumptions = await read('assumptions.json');
const names = ['alns-60x1', 'alns-300x3', 'alns-600x3', 'ortools-60s'];
const results = await Promise.all(names.map(async (name) => ({ name, ...(await read(`${name}.json`)) })));
const reference = baseline(state.jobs, state.engineers, createEvaluator(state, legFunction()));
const rows = results.map((r) => {
  assert.equal(r.inputSha256, inputSha256);
  assert.equal(new Set([...r.assignedIds, ...r.unassigned.map((j) => j.jobId)]).size, 500);
  return {
    name: r.name,
    assigned: r.metrics.assigned,
    coveragePercent: r.metrics.assigned / 5,
    urgentAssigned: state.jobs.filter((j) => j.priority === 'urgent' && r.assignedIds.includes(j.id)).length,
    usedEngineers: r.metrics.usedEngineers,
    km: r.metrics.km,
    travelMinutes: r.metrics.pendingTravel,
    onsiteMinutes: r.metrics.work,
    urgentWaitMinutes: r.metrics.urgentResponse,
    wallSeconds: r.wallMs / 1000,
    objective: r.objective,
    nativeSolution: r.name === 'ortools-60s' ? r.diagnostics.found : true,
  };
});
const before = await read('alns-60x1-before-cache.json'),
  seed = await read('ortools-60s-before-hint.json');
assert.deepEqual(results[0].routes, before.routes);
const pairs = [];
for (let a = 0; a < results.length; a++)
  for (let b = a + 1; b < results.length; b++)
    pairs.push({
      a: results[a].name,
      b: results[b].name,
      sameAssignedJobs: JSON.stringify(results[a].assignedIds) === JSON.stringify(results[b].assignedIds),
      objectiveComparison: compare(results[a].objective, results[b].objective),
    });
const codeFiles = [
  'server/optimization/evaluate.js',
  'server/optimization/search.js',
  'server/optimization/solver.js',
  'server/optimization/ortools-model.js',
  'server/optimization/ortools_solver.py',
  'server/optimization/runner.js',
];
const implementation = {};
for (const file of codeFiles)
  implementation[file] = crypto
    .createHash('sha256')
    .update(await fs.readFile(new URL('../' + file, import.meta.url)))
    .digest('hex');
const summary = {
  generatedAt: new Date().toISOString(),
  source,
  inputSha256,
  implementation,
  assumptions,
  baseline: {
    assigned: 500 - reference.unassigned.length,
    urgentAssigned: reference.lists.flat().filter((j) => j.priority === 'urgent').length,
    usedEngineers: reference.routes.filter((r) => r.used).length,
    km: reference.routes.reduce((n, r) => n + r.km, 0),
  },
  results: rows,
  pairs,
  cacheCheck: {
    identicalRoutes: true,
    beforeSeconds: before.wallMs / 1000,
    afterSeconds: results[0].wallMs / 1000,
    speedup: before.wallMs / results[0].wallMs,
  },
  google: {
    ...results[3].diagnostics,
    identicalToCommonSeed: JSON.stringify(seed.routes) === JSON.stringify(results[3].routes),
  },
  conclusion:
    'For this one generated geometry and current implementations, ALNS 300x3 covers 445/500 in 30.2 s; CP-SAT 60 s confirms the common initial plan of 420/500 without improving coverage. This is not a general ranking of OR-Tools vs ALNS. Neither large solution is proven optimal.',
};
await fs.writeFile(new URL('summary.json', root), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ baseline: summary.baseline, rows, pairs, cache: summary.cacheCheck }, null, 2));

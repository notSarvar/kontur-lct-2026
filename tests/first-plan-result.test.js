import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { replan } from '../server/application/planning.js';
import { applyAction } from '../server/application/actions.js';
import { loadState, persistState } from '../server/infrastructure/storage.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const opts = { roads: false, iterations: 0 };

test('first result is captured after planning, survives restart and is never replaced by replanning', async () => {
  const state = createScenario({ count: 8, engineerCount: 2, seed: 42 });
  await replan(state, opts);
  const initial = structuredClone(state.firstPlanResult);
  assert.equal(initial.total, 8);
  assert.equal(initial.assigned, state.plan.metrics.assigned);
  assert.equal(initial.unassigned, state.plan.metrics.unassigned);
  assert.equal(initial.assigned + initial.unassigned, 8);
  assert.equal(initial.usedEngineers, state.plan.metrics.usedEngineers);
  assert.equal(state.plan.initialResultId, initial.id);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kontur-first-plan-'));
  try {
    await persistState(dir, state);
    const restored = await loadState(dir);
    assert.deepEqual(restored.firstPlanResult, initial);
    assert.equal(restored.plan.initialResultId, initial.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await replan(state, opts);
  assert.deepEqual(state.firstPlanResult, initial);
  assert.equal(state.plan.initialResultId, undefined);
  delete state.firstPlanResult;
  await replan(state, opts);
  assert.equal(
    state.firstPlanResult,
    undefined,
    'existing days must not be backfilled with a false first result',
  );
});

test('new generated, imported and dataset days each get their own first calculation result', async () => {
  let state = createScenario({ count: 1, engineerCount: 1, seed: 42 });
  await replan(state, opts);
  const ids = [state.firstPlanResult.id];
  for (const action of [
    { type: 'generate', payload: { count: 3, engineerCount: 2, seed: 12 } },
    { type: 'import', payload: { jobs: state.jobs, engineers: state.engineers } },
    { type: 'dataset.load', payload: { id: 'east' } },
  ]) {
    state = await applyAction(state, action, opts);
    ids.push(state.firstPlanResult.id);
    assert.equal(state.firstPlanResult.total, state.jobs.length);
    assert.equal(state.plan.initialResultId, state.firstPlanResult.id);
  }
  assert.equal(new Set(ids).size, 4);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { applyAction } from '../server/application/actions.js';
import { replan } from '../server/application/planning.js';

const opts = { roads: false, iterations: 20 };

test('new generated days contain only planned work and reset the emergency mode', async () => {
  for (const seed of [0, 42, 12345]) {
    const state = createScenario({ seed, count: 100 });
    assert.equal(state.jobs.length, 100);
    assert(state.jobs.every((job) => job.priority === 'normal' && job.type !== 'emergency'));
    assert.deepEqual(state.jobs, createScenario({ seed, count: 100 }).jobs);
  }
  const previous = createScenario();
  previous.settings.mode = 'emergency';
  const next = await applyAction(
    previous,
    {
      type: 'generate',
      payload: { seed: 42, count: 12, engineerCount: 4, includeUrgent: true },
    },
    opts,
  );
  assert.equal(next.settings.mode, 'economy');
  assert(next.jobs.every((job) => job.priority === 'normal'));
  assert.equal(next.plan.routes.flatMap((route) => route.stops).length + next.plan.unassigned.length, 12);
});

test('unexpected requests enter only when the arrival event is triggered', async () => {
  let state = createScenario({ count: 8 });
  await replan(state, opts);
  state = await applyAction(state, { type: 'clock', payload: { time: 600 } }, opts);
  assert(state.jobs.every((job) => job.priority === 'normal'));
  const originalIds = new Set(state.jobs.map((job) => job.id));
  const next = await applyAction(state, { type: 'jobs.random', payload: { count: 20, seed: 42 } }, opts);
  const arrivals = next.jobs.filter((job) => !originalIds.has(job.id));
  assert.equal(arrivals.length, 20);
  assert(arrivals.some((job) => job.priority === 'urgent'));
  assert(arrivals.every((job) => job.createdAt === 600 && job.windowStart >= 615));
  assert.equal(next.settings.mode, 'emergency');
  assert.equal(state.jobs.length, 8);
});

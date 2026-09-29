import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnboardingSessions } from '../server/application/onboarding.js';
const a = 'a'.repeat(32),
  b = 'b'.repeat(32);
test('training sessions isolate recommendations, preview, approval and reset', async () => {
  const handle = createOnboardingSessions();
  const first = await handle(a, '/state', 'GET');
  const second = await handle(b, '/state', 'GET');
  assert.equal(first.jobs.length, 7);
  assert.equal(first.plan.metrics.assigned, 6);
  const job = first.jobs.find((j) => j.priority === 'urgent');
  const recommendations = await handle(a, '/engineer-recommendations', 'POST', {
    expectedRevision: first.revision,
    job,
  });
  assert.equal(recommendations.candidates.length, 3);
  const engineerId = recommendations.candidates[0].engineerId;
  const preview = await handle(a, '/preview', 'POST', {
    type: 'job.resolve',
    expectedRevision: first.revision,
    payload: { ...job, pinnedEngineerId: engineerId, confirmationNote: 'Клиент подтвердил время' },
  });
  assert.equal(preview.canApply, true);
  assert.deepEqual(await handle(a, '/state', 'GET'), first);
  await assert.rejects(
    handle(b, '/preview/apply', 'POST', { id: preview.id, expectedRevision: second.revision }),
    { code: 'CANDIDATE_EXPIRED' },
  );
  const applied = await handle(a, '/preview/apply', 'POST', {
    id: preview.id,
    expectedRevision: first.revision,
  });
  assert.equal(applied.jobs.find((j) => j.id === job.id).engineerId, engineerId);
  assert.deepEqual(await handle(b, '/state', 'GET'), second);
  const engineer = applied.plan.routes.find(
    (r) => applied.jobs.find((j) => j.id === r.stops[0]?.jobId)?.sop?.steps.length,
  ).engineerId;
  const travel = await handle(a, '/engineer-demo', 'POST', {
    stage: 'travel',
    engineerId: engineer,
    expectedRevision: applied.revision,
  });
  const working = await handle(a, '/engineer-demo', 'POST', {
    stage: 'work',
    engineerId: engineer,
    expectedRevision: travel.revision,
  });
  assert.ok(working.jobs.some((j) => j.status === 'working' && j.sop.steps.some((s) => !s.done)));
  const reset = await handle(a, '/reset', 'POST');
  assert.equal(reset.jobs[0].status, 'manual_review');
  assert.equal(reset.revision, working.revision + 1);
  await assert.rejects(
    handle(a, '/preview/apply', 'POST', { id: preview.id, expectedRevision: reset.revision }),
    { code: 'CANDIDATE_EXPIRED' },
  );
  await assert.rejects(handle(a, '/action', 'POST', { type: 'generate' }), { status: 400 });
});
test('training session limits, expiry, and identifiers are enforced', async () => {
  let now = 1;
  const handle = createOnboardingSessions({ ttl: 10, limit: 1, now: () => now });
  await assert.rejects(handle('invalid', '/state', 'GET'), { status: 400 });
  await handle(a, '/state', 'GET');
  await assert.rejects(handle(b, '/state', 'GET'), { status: 429 });
  now = 12;
  await assert.rejects(handle(a, '/reset', 'POST'), { status: 410 });
  await handle(b, '/state', 'GET');
});

test('engineer lesson follows departure and arrival lifecycle; SOP practice stays isolated', async () => {
  const handle = createOnboardingSessions();
  const initial = await handle(a, '/state', 'GET');
  const untouched = await handle(b, '/state', 'GET');
  const engineerId = initial.plan.routes.find((r) => r.stops.length).engineerId;
  await assert.rejects(
    handle(a, '/engineer-demo', 'POST', { stage: 'work', engineerId, expectedRevision: initial.revision }),
    { status: 400 },
  );
  const travel = await handle(a, '/engineer-demo', 'POST', {
    stage: 'travel',
    engineerId,
    expectedRevision: initial.revision,
  });
  const visit = travel.jobs.find((j) => j.engineerId === engineerId && j.status === 'enroute');
  assert.ok(visit);
  await assert.rejects(
    handle(a, '/engineer-demo', 'POST', { stage: 'work', engineerId, expectedRevision: initial.revision }),
    { status: 409 },
  );
  const working = await handle(a, '/engineer-demo', 'POST', {
    stage: 'work',
    engineerId,
    expectedRevision: travel.revision,
  });
  const job = working.jobs.find((j) => j.id === visit.id);
  assert.equal(job.status, 'working');
  assert.ok(job.arrivedAt >= job.windowStart);
  assert.equal(job.sop.steps.filter((s) => !s.done).length, 1);
  assert.equal(working.settings.autoChecklists, false);
  const complete = await handle(a, '/action', 'POST', {
    type: 'job.sop.check',
    payload: { id: job.id, stepId: job.sop.steps.at(-1).id, done: true, expectedRevision: working.revision },
  });
  assert.ok(complete.jobs.find((j) => j.id === job.id).sop.steps.every((s) => s.done));
  assert.deepEqual(await handle(b, '/state', 'GET'), untouched);
  const reset = await handle(a, '/reset', 'POST');
  assert.equal(reset.settings.autoChecklists, true);
  assert.equal(reset.onboardingStage, undefined);
});

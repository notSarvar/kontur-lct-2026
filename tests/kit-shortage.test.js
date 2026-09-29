import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { replan } from '../server/application/planning.js';
import { applyAction } from '../server/application/actions.js';
import { previewAction, activateCandidate } from '../server/application/candidates.js';
import { shiftKit } from '../src/shared/shift-kit.js';
import { incompatibilities } from '../server/optimization/evaluate.js';
const opts = { roads: false, iterations: 0 };
const act = (s, type, payload = {}) =>
  applyAction(s, { type, payload: { ...payload, expectedRevision: s.revision } }, opts);
async function fixture() {
  const s = createScenario({ count: 2, engineerCount: 2, seed: 42 });
  for (const e of s.engineers)
    Object.assign(e, {
      skills: ['connection', 'local'],
      equipment: [],
      shiftStart: 480,
      shiftEnd: 1080,
      home: { ...s.engineers[0].home },
      position: { ...s.engineers[0].home },
    });
  s.jobs.forEach((j, i) =>
    Object.assign(j, s.engineers[0].position, {
      type: i ? 'local' : 'connection',
      skills: [i ? 'local' : 'connection'],
      equipment: [],
      requiredTransport: 'any',
      windowStart: 540,
      windowEnd: 1020,
      duration: 30,
      priority: 'normal',
      pinnedEngineerId: s.engineers[0].id,
    }),
  );
  await replan(s, opts);
  let state = await act(s, 'simulation.checklists', { enabled: false });
  const items = shiftKit(state, state.engineers[0]).items;
  for (const item of items.slice(1))
    state = await act(state, 'engineer.kit.check', { id: state.engineers[0].id, key: item.key, done: true });
  return state;
}
const report = (s) => act(s, 'engineer.kit.submit', { id: s.engineers[0].id, confirmMissing: true });
test('shortage report requires explicit confirmation, preserves plan and creates one incident linked to SOP jobs', async () => {
  const s = await fixture(),
    id = s.engineers[0].id;
  await assert.rejects(act(s, 'engineer.kit.submit', { id }), /Подтвердите/);
  const next = await report(s),
    t = next.support.find((t) => t.kind === 'kit_shortage');
  assert.equal(t.missing.length, 1);
  assert.deepEqual(t.affectedJobIds, [s.jobs[0].id]);
  assert.deepEqual(next.plan, s.plan);
  assert(next.notifications.some((e) => JSON.stringify(e).includes('Маршрут инженера под риском')));
  await assert.rejects(report(next), /уже передана/);
  await assert.rejects(act(next, 'support.resolve', { id: t.id }), /Выберите решение/);
  await assert.rejects(act(next, 'job.depart', { id: s.jobs[0].id }), /приостановлен/);
  const automatic = await act(next, 'simulation.checklists', { enabled: true });
  const advanced = await act(automatic, 'clock', { time: 550 });
  assert(advanced.jobs.every((j) => j.status === 'pending'));
});
test('confirmation marks reported items, survives JSON persistence and leaves the route exactly unchanged', async () => {
  let s = await report(await fixture());
  s = JSON.parse(JSON.stringify(s));
  const before = structuredClone(s.plan);
  s = await act(s, 'engineer.kit.resolve', { id: s.support[0].id, decision: 'confirm' });
  assert(shiftKit(s, s.engineers[0]).ready);
  assert.deepEqual(s.plan, before);
  assert.equal(s.support[0].status, 'resolved');
  await assert.rejects(
    act(s, 'engineer.kit.resolve', { id: s.support[0].id, decision: 'confirm' }),
    /уже обработано/,
  );
});
for (const decision of ['skip', 'withdraw'])
  test(`${decision} is previewed without mutation, then applied with constraints`, async () => {
    const s = await report(await fixture()),
      saved = structuredClone(s);
    const candidate = await previewAction(
      s,
      {
        type: 'engineer.kit.resolve',
        expectedRevision: s.revision,
        payload: { id: s.support[0].id, decision, expectedRevision: s.revision },
      },
      opts,
    );
    assert.deepEqual(s, saved);
    assert(candidate.canApply);
    const after = activateCandidate(s, candidate, s.revision);
    assert.equal(after.support[0].status, 'resolved');
    if (decision === 'skip') {
      assert.equal(after.jobs[0].status, 'blocked');
      assert.equal(after.jobs[1].engineerId, s.engineers[0].id);
      assert.equal(after.jobs[1].status, 'pending');
      assert(incompatibilities(after.jobs[0], after.engineers[0]).includes('materials'));
      assert(shiftKit(after, after.engineers[0]).ready);
      const unblocked = await act(after, 'support.resolve', {
        id: after.support.find((t) => t.kind === 'material_job').id,
      });
      assert.notEqual(unblocked.jobs[0].engineerId, s.engineers[0].id);
    } else {
      assert(after.engineers[0].shiftWithdrawn);
      assert(after.jobs.every((j) => j.engineerId !== s.engineers[0].id));
      assert(after.jobs.every((j) => j.engineerId === s.engineers[1].id));
    }
    await assert.rejects(
      () =>
        previewAction(
          s,
          { type: 'engineer.kit.resolve', expectedRevision: s.revision - 1, payload: {} },
          opts,
        ),
      /уже изменился/,
    );
  });
test('unknown resolution, stale reports and forged missing lists are rejected or ignored', async () => {
  const s = await fixture();
  await assert.rejects(
    applyAction(
      s,
      {
        type: 'engineer.kit.submit',
        payload: { id: s.engineers[0].id, confirmMissing: true, expectedRevision: -1 },
      },
      opts,
    ),
    /изменились/,
  );
  const n = await act(s, 'engineer.kit.submit', { id: s.engineers[0].id, confirmMissing: true, missing: [] });
  assert.equal(n.support[0].missing.length, 1);
  await assert.rejects(
    act(n, 'engineer.kit.resolve', { id: n.support[0].id, decision: 'ignore' }),
    /Выберите/,
  );
});

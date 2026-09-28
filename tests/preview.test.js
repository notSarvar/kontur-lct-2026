import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { replan } from '../server/application/planning.js';
import { previewAction, activateCandidate } from '../server/application/candidates.js';
import { applyAction } from '../server/application/actions.js';
import { solve } from '../server/optimization/solver.js';
import { objective, compare } from '../server/optimization/evaluate.js';
import { preparedMatrix } from '../server/infrastructure/prepared-travel.js';
import { pointKey, legFunction } from '../server/optimization/travel.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadState, persistState } from '../server/infrastructure/storage.js';
import { diffPlans } from '../server/domain/plan-diff.js';
const opts = { roads: false, iterations: 20 };
test('accepted plan, assignments, events and full diff survive a server restart unchanged', async () => {
  const state = fixture();
  await replan(state, opts);
  const c = await previewAction(
    state,
    { type: 'job.delete', expectedRevision: state.revision, payload: { id: state.jobs[0].id } },
    opts,
  );
  const applied = activateCandidate(state, c, state.revision);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kontur-diff-'));
  try {
    await persistState(dir, applied);
    const loaded = await loadState(dir);
    assert.deepEqual(loaded.plan, applied.plan);
    assert.deepEqual(loaded.jobs, applied.jobs);
    assert.deepEqual(loaded.notifications, applied.notifications);
    assert.deepEqual(loaded.plan.diff, applied.plan.diff);
    assert.equal(loaded.plan.diff.summary.removed, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('loading a saved day without a plan rebuilds its schedule', async () => {
  const state = fixture();
  await replan(state, opts);
  delete state.plan;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kontur-missing-plan-'));
  try {
    await persistState(dir, state);
    const loaded = await loadState(dir);
    assert.equal(loaded.plan.at, state.time);
    assert.equal(loaded.plan.metrics.assigned, state.jobs.length);
    assert(loaded.plan.routes.some((route) => route.stops.length));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('full diff retains more than ten jobs and detects route geometry without a timetable change', async () => {
  const state = fixture(12);
  await replan(state, opts);
  const after = structuredClone(state);
  for (const job of after.jobs) job.duration++;
  after.plan.routes[0].segments = [
    {
      coordinates: [
        [55, 37],
        [55.1, 37.1],
      ],
      roadGeometry: true,
    },
  ];
  const diff = diffPlans(state, after);
  assert.equal(diff.jobChanges.length, 12);
  assert.equal(diff.summary.updated, 12);
  assert(diff.routeChanges.some((c) => c.engineerId === after.plan.routes[0].engineerId));
});
test('prepared travel uses the locked destination during an ongoing trip, not an interpolated GPS point', () => {
  const s = fixture(1),
    a = s.engineers[0].position;
  const bundle = {
    points: [pointKey(a)],
    durationSeconds: [[0]],
    distanceMeters: [[0]],
    provider: 'fixture',
  };
  Object.assign(s.jobs[0], { status: 'enroute', engineerId: s.engineers[0].id });
  s.engineers[0].position = { lat: a.lat + 0.001, lng: a.lng + 0.001 };
  assert.doesNotThrow(() => preparedMatrix(s, bundle));
});
function fixture(count = 2) {
  const state = createScenario({ count, engineerCount: 2 });
  for (const e of state.engineers)
    Object.assign(e, { skills: ['local', 'connection'], shiftStart: 480, shiftEnd: 1380 });
  for (const j of state.jobs)
    Object.assign(j, {
      ...state.engineers[0].home,
      skills: ['local'],
      type: 'local',
      priority: 'normal',
      windowStart: 540,
      windowEnd: 1200,
      duration: 30,
    });
  return state;
}
test('manual preview preserves current state; apply pins an ordinary planned visit', async () => {
  const state = fixture();
  await replan(state, opts);
  const old = structuredClone(state),
    job = state.jobs[0],
    e = state.engineers.find((e) => e.id !== job.engineerId);
  const c = await previewAction(
    state,
    { type: 'job.assign', payload: { id: job.id, engineerId: e.id }, expectedRevision: state.revision },
    opts,
  );
  assert.deepEqual(state, old);
  assert.equal(c.canApply, true);
  assert.equal(c.after.jobs[0].engineerId, e.id);
  assert(c.diff.jobChanges.find((x) => x.jobId === job.id).kinds.includes('reassigned'));
  const applied = activateCandidate(state, c, state.revision);
  assert.equal(applied.jobs[0].pinnedEngineerId, e.id);
  assert.equal(applied.revision, state.revision + 1);
});
test('incompatible pin cannot activate and does not replace a valid plan', async () => {
  const state = fixture();
  state.engineers[1].skills = ['emergency'];
  await replan(state, opts);
  const old = JSON.stringify(state);
  const c = await previewAction(
    state,
    {
      type: 'job.assign',
      payload: { id: state.jobs[0].id, engineerId: state.engineers[1].id },
      expectedRevision: state.revision,
    },
    opts,
  );
  assert.equal(c.canApply, false);
  assert.equal(c.validation.violations[0].code, 'LOCK_CONFLICT');
  assert.throws(() => activateCandidate(state, c, state.revision), /конфликт/);
  assert.equal(JSON.stringify(state), old);
});
test('stale preview and duplicate apply cannot overwrite a newer active revision', async () => {
  const state = fixture();
  await replan(state, opts);
  await assert.rejects(
    () => previewAction(state, { type: 'optimize', expectedRevision: state.revision - 1 }, opts),
    /изменился/,
  );
  const c = await previewAction(state, { type: 'optimize', expectedRevision: state.revision }, opts);
  const newer = activateCandidate(state, c, state.revision);
  assert.throws(() => activateCandidate(newer, c, state.revision), /изменился/);
  assert.throws(() => activateCandidate(state, null, state.revision), /истёк/);
});
test('added and removed jobs appear in full diff even when there was no prior stop', async () => {
  const state = fixture(1);
  await replan(state, opts);
  const c = await previewAction(
    state,
    {
      type: 'job.save',
      payload: { ...state.jobs[0], id: undefined, title: 'Новая авария', priority: 'urgent' },
      expectedRevision: 0,
    },
    opts,
  );
  assert.equal(c.after.settings.mode, 'emergency');
  assert.equal(c.diff.summary.added, 1);
  const added = c.diff.jobChanges.find((x) => x.kinds.includes('added'));
  assert.equal(added.before, null);
  assert.equal(added.after.priority, 'urgent');
  const removed = await applyAction(c.after, { type: 'job.delete', payload: { id: added.jobId } }, opts);
  assert.equal(removed.plan.diff.summary.removed, 1);
  assert.equal(removed.plan.changes.find((x) => x.jobId === added.jobId).after, null);
});
test('economy and emergency choose different staffing on an explicit trade-off', () => {
  const state = fixture(2);
  state.settings.stability = false;
  state.engineers[0].shiftStart = 600;
  state.engineers[1].skills = ['local'];
  Object.assign(state.jobs[0], { priority: 'urgent', windowStart: 480, createdAt: 0 });
  Object.assign(state.jobs[1], { skills: ['connection'], windowStart: 600 });
  const economy = solve(state, {}, { iterations: 20 });
  state.settings.mode = 'emergency';
  const emergency = solve(state, {}, { iterations: 20 });
  assert.equal(economy.metrics.assigned, 2);
  assert.equal(emergency.metrics.assigned, 2);
  assert.equal(economy.metrics.usedEngineers, 1);
  assert.equal(emergency.metrics.usedEngineers, 2);
  assert(emergency.metrics.urgentResponse < economy.metrics.urgentResponse);
});
test('assignment stability outranks distance when primary objectives tie', () => {
  const route = { used: true, urgentResponse: 0, changes: 0, km: 20, drive: 30 };
  const stable = { mode: 'economy', unassigned: [], routes: [route] };
  const short = { ...stable, routes: [{ ...route, changes: 1, km: 1 }] };
  assert(compare(objective(stable), objective(short)) < 0);
});
test('urgent waiting includes the elapsed part of its window after replanning', () => {
  const s = fixture(1);
  s.time = 600;
  Object.assign(s.jobs[0], { priority: 'urgent', windowStart: 540, createdAt: 480 });
  assert.equal(solve(s).metrics.urgentResponse, 60);
});
test('confirmed coordinates update duplicate addresses and preserve windows', async () => {
  const s = fixture();
  for (const j of s.jobs) Object.assign(j, { address: 'Один дом', lat: null, lng: null });
  await replan(s, opts);
  const windows = s.jobs.map((j) => [j.windowStart, j.windowEnd]);
  const c = await previewAction(
    s,
    {
      type: 'geography.confirm',
      expectedRevision: 0,
      payload: { id: s.jobs[0].id, ...s.engineers[0].home, confirmationNote: 'Здание проверено' },
    },
    opts,
  );
  assert.equal(c.after.geography.status, 'ready');
  assert.deepEqual(
    c.after.jobs.map((j) => [j.windowStart, j.windowEnd]),
    windows,
  );
  assert(c.after.jobs.every((j) => j.geocode.precision === 'manual'));
  assert(s.jobs.every((j) => j.lat === null));
});
test('prepared walking matrix is directional, cached and never silently estimates missing points', () => {
  const s = fixture(1),
    a = s.engineers[0].position;
  s.jobs[0].lng += 0.01;
  const b = s.jobs[0];
  const bundle = {
    points: [pointKey(a), pointKey(b)],
    durationSeconds: [
      [0, 600],
      [900, 0],
    ],
    distanceMeters: [
      [0, 700],
      [800, 0],
    ],
    provider: 'fixture',
  };
  const matrix = preparedMatrix(s, bundle),
    leg = legFunction(matrix);
  assert.equal(leg(a, b, { transport: 'foot' }).minutes, 10);
  assert.equal(leg(b, a, { transport: 'foot' }).minutes, 15);
  assert.equal(leg(a, b, { transport: 'transit' }).mode, 'foot');
  assert.equal(leg(a, b, { transport: 'transit' }).estimated, false);
  bundle.durationSeconds[0][1] = null;
  bundle.distanceMeters[0][1] = null;
  assert.equal(legFunction(preparedMatrix(s, bundle))(a, b, { transport: 'foot' }).minutes, Infinity);
  b.lng += 0.01;
  assert.throws(() => preparedMatrix(s, bundle), /нет 1 точек/);
});

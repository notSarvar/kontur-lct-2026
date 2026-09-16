import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import {
  solve,
  incompatibilities,
  estimatedTravel,
  travelFunction,
  pointKey,
} from '../server/optimization/solver.js';
import { replan } from '../server/application/planning.js';
import { applyAction } from '../server/application/actions.js';
import { advance } from '../server/domain/lifecycle.js';
import { validateJob } from '../server/domain/validation.js';
const offline = { roads: false, iterations: 12 };
function base() {
  const s = createScenario({ count: 1, engineerCount: 1 });
  s.settings.roadMode = 'estimate';
  s.jobs[0] = {
    ...s.jobs[0],
    title: 'Проверка',
    lat: s.engineers[0].position.lat,
    lng: s.engineers[0].position.lng,
    skills: ['local'],
    equipment: [],
    windowStart: 540,
    windowEnd: 660,
    slaDue: 700,
    duration: 30,
    requiredTransport: 'any',
    priority: 'normal',
  };
  return s;
}
function verify(state, plan) {
  const seen = new Set();
  for (const route of plan.routes) {
    const e = state.engineers.find((e) => e.id === route.engineerId);
    let end = Math.max(state.time, e.shiftStart, e.pausedUntil || 0),
      point = e.position;
    for (const stop of route.stops) {
      assert(!seen.has(stop.jobId), 'Each job assigned once');
      seen.add(stop.jobId);
      const job = state.jobs.find((j) => j.id === stop.jobId);
      assert(job);
      assert.equal(incompatibilities(job, e).length, 0);
      if (!stop.locked) {
        assert(stop.depart >= end);
        assert(stop.arrival >= stop.depart + estimatedTravel(point, job, e.transport));
        assert(stop.start >= stop.arrival);
        assert(stop.start >= job.windowStart);
        assert(stop.start <= job.windowEnd);
        assert.equal(stop.end, stop.start + job.duration);
        assert(stop.end <= e.shiftEnd);
      }
      end = stop.end;
      point = job;
    }
  }
  for (const u of plan.unassigned) {
    assert(!seen.has(u.jobId));
    seen.add(u.jobId);
    assert(u.text.length > 0);
  }
  assert.equal(
    seen.size,
    state.jobs.filter((j) => !['done', 'blocked'].includes(j.status)).length,
    'No job silently lost',
  );
}
test('generated scenarios preserve all constraints and never lose or duplicate a job', () => {
  for (let seed = 1; seed <= 35; seed++) {
    const s = createScenario({ seed, count: 10 + seed, engineerCount: 1 + (seed % 6) });
    verify(s, solve(s));
  }
});
test('fixed seeds reproduce the same inputs and plans', () => {
  const a = createScenario({ seed: 7 }),
    b = createScenario({ seed: 7 });
  assert.deepEqual(a.jobs, b.jobs);
  assert.deepEqual(solve(a).routes, solve(b).routes);
  assert.notDeepEqual(a.jobs, createScenario({ seed: 8 }).jobs);
});
test('qualification, equipment and transport violations are never allowed', () => {
  for (const [key, value, code] of [
    ['skills', ['emergency'], 'qualification'],
    ['equipment', ['tester'], 'equipment'],
    ['requiredTransport', 'bike', 'transport'],
  ]) {
    const s = base();
    s.jobs[0][key] = value;
    const p = solve(s);
    assert.equal(p.metrics.assigned, 0);
    assert.equal(p.unassigned[0].code, code);
  }
});
test('start window is hard; completion beyond the window is allowed within the shift', () => {
  const s = base();
  s.jobs[0].windowEnd = 540;
  s.jobs[0].slaDue = 550;
  const p = solve(s);
  assert.equal(p.metrics.assigned, 1);
  assert.equal(p.metrics.late, 0);
  assert.equal(p.metrics.lateMinutes, 0);
  s.time = 541;
  assert.equal(solve(s).metrics.assigned, 0);
});
test('work must finish before shift ends, including service duration', () => {
  const s = base();
  s.engineers[0].shiftEnd = 560;
  assert.equal(solve(s).metrics.assigned, 0);
});
test('shared scarce time goes to an urgent job', () => {
  const s = base();
  s.jobs[0].windowEnd = 540;
  s.jobs[0].duration = 60;
  const urgent = { ...structuredClone(s.jobs[0]), id: 'urgent', priority: 'urgent' };
  s.jobs.push(urgent);
  const p = solve(s);
  assert.equal(p.metrics.assigned, 1);
  assert.equal(p.routes[0].stops[0].jobId, 'urgent');
});
test('OSRM null entries represent unreachable roads, not zero travel', () => {
  const s = base();
  s.engineers[0].transport = 'car';
  const a = s.engineers[0].position,
    b = s.jobs[0];
  b.lng += 0.01;
  const matrix = { [`${pointKey(a)}|${pointKey(b)}`]: null };
  assert.equal(travelFunction(matrix)(a, b, s.engineers[0]), Infinity);
  assert.equal(solve(s, matrix).metrics.assigned, 0);
});
test('paused engineers do not depart during their break', () => {
  const s = base();
  s.engineers[0].pausedUntil = 610;
  const p = solve(s);
  assert(p.routes[0].stops[0].depart >= 610);
  verify(s, p);
});
test('advancing time completes jobs and records actual SLA rather than fake statistics', async () => {
  const s = base();
  await replan(s, offline);
  advance(s, 575);
  assert.equal(s.jobs[0].status, 'done');
  assert.equal(s.jobs[0].actualStart, 540);
  assert.equal(s.jobs[0].actualEnd, 570);
  assert.deepEqual(s.engineers[0].position, { lat: s.jobs[0].lat, lng: s.jobs[0].lng });
});
test('a started trip survives urgent replanning with its assigned engineer and slot', async () => {
  let s = base();
  s.jobs[0].lng += 0.015;
  await replan(s, offline);
  advance(s, 485);
  assert.equal(s.jobs[0].status, 'enroute');
  const locked = structuredClone(s.jobs[0].lockedStop),
    id = s.jobs[0].engineerId;
  s = await applyAction(
    s,
    {
      type: 'job.save',
      payload: {
        ...s.jobs[0],
        id: undefined,
        title: 'Срочная',
        priority: 'urgent',
        windowStart: 490,
        windowEnd: 750,
      },
    },
    offline,
  );
  assert.equal(s.jobs[0].engineerId, id);
  assert.deepEqual(s.jobs[0].lockedStop, locked);
  assert.equal(s.plan.routes[0].stops[0].jobId, s.jobs[0].id);
  assert.equal(s.plan.routes[0].stops[0].end, locked.end);
});
test('break requested during work begins after that commitment', async () => {
  let s = base();
  await replan(s, offline);
  advance(s, 550);
  s = await applyAction(
    s,
    { type: 'engineer.pause', payload: { id: s.engineers[0].id, minutes: 30 } },
    offline,
  );
  assert.equal(s.engineers[0].pausedUntil, 600);
  assert.equal(s.jobs[0].status, 'working');
  assert.equal(s.plan.routes[0].stops[0].end, 570);
});
test('invalid input is rejected atomically without changing the existing day', async () => {
  const s = base(),
    snapshot = structuredClone(s);
  await assert.rejects(
    applyAction(s, { type: 'job.save', payload: { ...s.jobs[0], lat: 'wrong' } }, offline),
    /Координаты/,
  );
  assert.deepEqual(s, snapshot);
  assert.throws(() => validateJob({ ...s.jobs[0], duration: -10 }), /Длительность/);
});
test('the clock cannot rewind completed work', () => {
  const s = base();
  s.time = 600;
  assert.throws(() => advance(s, 599), /только вперёд/);
});
test('notes survive replanning and incident queue is actionable', async () => {
  let s = base();
  await replan(s, offline);
  s = await applyAction(
    s,
    { type: 'job.note', payload: { id: s.jobs[0].id, text: 'Проверка выполнена' } },
    offline,
  );
  s = await applyAction(
    s,
    { type: 'job.issue', payload: { id: s.jobs[0].id, text: 'Закрыт доступ' } },
    offline,
  );
  assert.equal(s.jobs[0].status, 'blocked');
  assert.equal(s.plan.metrics.assigned, 0);
  assert.equal(s.support[0].status, 'open');
  s = await applyAction(s, { type: 'support.resolve', payload: { id: s.support[0].id } }, offline);
  assert.equal(s.jobs[0].status, 'pending');
  assert.equal(s.plan.metrics.assigned, 1);
  assert.equal(s.jobs[0].notes[0].text, 'Проверка выполнена');
});
test('manual completion only works on an in-progress job', async () => {
  let s = base();
  await replan(s, offline);
  await assert.rejects(
    applyAction(s, { type: 'job.complete', payload: { id: s.jobs[0].id } }, offline),
    /начатую/,
  );
  advance(s, 550);
  s = await applyAction(s, { type: 'job.complete', payload: { id: s.jobs[0].id } }, offline);
  assert.equal(s.jobs[0].actualEnd, 550);
  assert.equal(s.plan.metrics.assigned, 0);
});
test('import creates a fresh editable day, not fixed route outputs', async () => {
  const s = base();
  const next = await applyAction(
    s,
    { type: 'import', payload: { jobs: [s.jobs[0]], engineers: s.engineers } },
    offline,
  );
  assert.equal(next.time, 480);
  assert.equal(next.jobs[0].status, 'pending');
  assert.equal(next.plan.metrics.assigned, 1);
  verify(next, next.plan);
});
test('random incoming batches preserve history and current time', async () => {
  let s = base();
  await replan(s, offline);
  advance(s, 580);
  s = await applyAction(s, { type: 'jobs.random', payload: { count: 5, seed: 321 } }, offline);
  assert.equal(s.time, 580);
  assert.equal(s.jobs.length, 6);
  assert.equal(s.jobs[0].status, 'done');
  assert.equal(s.jobs[0].actualEnd, 570);
  assert(s.jobs.slice(1).every((j) => j.createdAt === 580 && j.windowStart >= 595));
  verify(s, s.plan);
});

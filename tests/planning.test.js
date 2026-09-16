import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { deriveEngineers, createOfficialScenario } from '../server/domain/official-scenario.js';
import { applyAction } from '../server/application/actions.js';
import { replan } from '../server/application/planning.js';
import { solve } from '../server/optimization/solver.js';
import { estimatedLeg, pointKey } from '../server/optimization/travel.js';
import { objective, compare } from '../server/optimization/evaluate.js';
import { loadOfficialDatasets } from '../server/infrastructure/datasets.js';
import { normalizeAddress, structuredAddress } from '../server/infrastructure/geocoding.js';
import { exportScenario } from '../server/domain/export.js';

const offline = { roads: false, iterations: 20 };
function simple(count = 1, engineers = 1) {
  const state = createScenario({ count, engineerCount: engineers });
  for (const e of state.engineers) {
    e.skills = ['local'];
    e.shiftStart = 480;
    e.shiftEnd = 1380;
  }
  for (const job of state.jobs)
    Object.assign(job, {
      type: 'local',
      title: 'Локальная работа',
      skills: ['local'],
      priority: 'normal',
      ...state.engineers[0].position,
      windowStart: 540,
      windowEnd: 660,
      duration: 60,
    });
  return state;
}

test('baseline is input order and first feasible engineer, not nearest or urgency order', () => {
  const s = simple(2, 2);
  s.engineers[0].position.lng += 0.01;
  s.jobs[1].priority = 'urgent';
  const p = solve(s);
  assert.deepEqual(
    p.baseline.routes[0].stops.map((s) => s.jobId),
    s.jobs.map((j) => j.id),
  );
  assert.equal(p.baseline.routes[1].stops.length, 0);
  assert(
    compare(
      p.objective,
      objective({
        routes: p.baseline.routes,
        unassigned: p.baseline.unassigned.map((id) => s.jobs.find((j) => j.id === id)),
      }),
    ) <= 0,
  );
});

test('urgent conflict preserves the client window and requires explicit dispatcher resolution', async () => {
  let s = simple();
  s.jobs[0].windowEnd = 540;
  await replan(s, offline);
  const original = s.jobs[0].id;
  s = await applyAction(
    s,
    { type: 'job.save', payload: { ...s.jobs[0], id: undefined, title: 'Авария', priority: 'urgent' } },
    offline,
  );
  const held = s.jobs.find((j) => j.id === original);
  assert.equal(held.status, 'manual_review');
  assert.equal(held.windowEnd, 540);
  assert.deepEqual(held.originalWindow, { start: 540, end: 540 });
  assert.equal(s.support.filter((t) => t.jobId === original && t.status === 'open').length, 1);
  s = await applyAction(s, { type: 'optimize' }, offline);
  assert.equal(s.jobs.find((j) => j.id === original).status, 'manual_review');
  assert.equal(s.support.filter((t) => t.jobId === original && t.status === 'open').length, 1);
  await assert.rejects(
    applyAction(
      s,
      { type: 'job.resolve', payload: { id: original, windowStart: 600, windowEnd: 720 } },
      offline,
    ),
    /согласования/,
  );
  s = await applyAction(
    s,
    {
      type: 'job.resolve',
      payload: {
        id: original,
        windowStart: 600,
        windowEnd: 720,
        confirmationNote: 'Клиент подтвердил 10–12',
      },
    },
    offline,
  );
  assert.equal(s.jobs.find((j) => j.id === original).status, 'pending');
  assert.equal(s.jobs.find((j) => j.id === original).windowStart, 600);
  assert.equal(s.history.at(-1).before.windowEnd, 540);
  assert.equal(s.history.at(-1).after.windowEnd, 720);
  assert.equal(s.support.filter((t) => t.jobId === original && t.status === 'open').length, 0);
});

test('manual assignment cannot bypass skills or windows, and failed resolution returns to the queue', async () => {
  let s = simple(1, 2);
  s.jobs[0].windowEnd = 480;
  s.jobs[0].windowStart = 480;
  s.time = 500;
  s.engineers[1].skills = ['emergency'];
  await replan(s, offline);
  s = await applyAction(
    s,
    {
      type: 'job.resolve',
      payload: {
        id: s.jobs[0].id,
        windowStart: 600,
        windowEnd: 800,
        pinnedEngineerId: s.engineers[1].id,
        confirmationNote: 'Окно согласовано',
      },
    },
    offline,
  );
  assert.equal(s.jobs[0].status, 'manual_review');
  assert.equal(s.plan.metrics.assigned, 0);
  assert.equal(s.support.filter((t) => t.status === 'open').length, 1);
});

test('a missing coordinate is never silently located at the depot', async () => {
  const s = simple();
  s.jobs[0].lat = null;
  s.jobs[0].lng = null;
  await replan(s, offline);
  assert.equal(s.jobs[0].status, 'manual_review');
  assert.equal(s.jobs[0].lat, null);
  assert.equal(s.jobs[0].reviewReason.code, 'coordinates');
  assert.equal(s.plan.metrics.km, 0);
});

test('official inputs round trip through export with unresolved addresses and stable IDs', async () => {
  const s = await createOfficialScenario('southcenter');
  await replan(s, offline);
  const copy = await applyAction(s, { type: 'import', payload: exportScenario(s) }, offline);
  assert.deepEqual(
    copy.jobs.map((j) => j.id),
    s.jobs.map((j) => j.id),
  );
  assert.deepEqual(
    copy.engineers.map((e) => e.id),
    s.engineers.map((e) => e.id),
  );
  assert.deepEqual(
    copy.jobs.map((j) => j.number),
    s.jobs.map((j) => j.number),
  );
  assert.equal(copy.jobs.filter((j) => j.lat === null).length, s.jobs.filter((j) => j.lat === null).length);
  assert.deepEqual(copy.jobs[0].source, s.jobs[0].source);
});

test('dispatcher may add staff without silently growing the optimisation pool', async () => {
  const s = simple();
  const next = await applyAction(
    s,
    { type: 'engineer.save', payload: { ...s.engineers[0], id: undefined, name: 'Резервный инженер' } },
    offline,
  );
  assert.equal(next.engineers.length, 2);
  assert.equal(next.engineers[1].name, 'Резервный инженер');
  assert.equal(s.engineers.length, 1);
});

test('synthetic roster is fixed from workload and covers required skills in every region', async () => {
  for (const d of await loadOfficialDatasets()) {
    const a = deriveEngineers(d.jobs, { lat: 55.7, lng: 37.6 }, d.id),
      b = deriveEngineers(d.jobs, { lat: 55.7, lng: 37.6 }, d.id);
    assert.deepEqual(a, b);
    assert(a.engineers.length > 0 && a.engineers.length < d.jobs.length);
    for (const j of d.jobs) assert(a.engineers.some((e) => j.skills.every((k) => e.skills.includes(k))));
    assert(a.engineers.every((e) => e.transport === 'transit' && e.synthetic));
    const actual = await createOfficialScenario(d.id);
    assert.equal(actual.jobs.length, d.jobs.length);
    assert.equal(
      actual.jobs.filter((j) => j.type === 'emergency').length,
      d.jobs.filter((j) => j.type === 'emergency').length,
    );
  }
});

test('walking and transit estimates have separate minutes and kilometres', () => {
  const a = { lat: 55.75, lng: 37.6 },
    b = { lat: 55.751, lng: 37.6 },
    c = { lat: 55.85, lng: 37.6 };
  assert.equal(estimatedLeg(a, b, 'transit').mode, 'foot');
  assert.equal(estimatedLeg(a, c, 'transit').mode, 'transit');
  assert(estimatedLeg(a, c, 'transit').minutes < estimatedLeg(a, c, 'foot').minutes);
  const s = simple();
  s.engineers[0].transport = 'car';
  s.jobs[0].lng += 0.01;
  const p = solve(s, {
    [`${pointKey(s.engineers[0].position)}|${pointKey(s.jobs[0])}`]: { minutes: 50, km: 2, estimated: false },
  });
  assert.equal(p.metrics.travel, 50);
  assert.equal(p.metrics.km, 2);
});

test('address abbreviation expansion does not corrupt street names', () => {
  assert.match(normalizeAddress('Город Москва, ул.Дмитрия Ульянова, д. 27'), /Дмитрия Ульянова/);
  assert.match(normalizeAddress('Москва Булатниковский пр-зд. д. 6к1'), /Булатниковский/);
  assert.equal(
    structuredAddress('Город Москва, ул.3-я Институтская, д. 5 к 2').street,
    '5к2 3-я Институтская улица',
  );
});

test('small open route matches an independent exhaustive permutation oracle', () => {
  const s = simple(5, 2);
  const coordinates = [
    [55.75, 37.6],
    [55.75, 37.63],
    [55.78, 37.64],
    [55.76, 37.62],
    [55.79, 37.59],
  ];
  s.jobs.forEach((j, i) =>
    Object.assign(j, {
      lat: coordinates[i][0],
      lng: coordinates[i][1],
      windowStart: 480,
      windowEnd: 1300,
      duration: 15,
    }),
  );
  function permutations(items) {
    return items.length
      ? items.flatMap((v, i) => permutations(items.filter((_, k) => k !== i)).map((rest) => [v, ...rest]))
      : [[]];
  }
  let exact = Infinity;
  for (const order of permutations(s.jobs)) {
    let km = 0,
      time = 480,
      point = s.engineers[0].position;
    for (const job of order) {
      const trip = estimatedLeg(point, job, 'transit');
      km += trip.km;
      time += trip.minutes + job.duration;
      point = job;
    }
    if (time <= 1380) exact = Math.min(exact, km);
  }
  const plan = solve(s, {}, { iterations: 150 });
  assert.equal(plan.metrics.assigned, 5);
  assert.equal(plan.metrics.usedEngineers, 1);
  assert(Math.abs(plan.metrics.km - exact) < 1e-6, `${plan.metrics.km} vs exact ${exact}`);
});

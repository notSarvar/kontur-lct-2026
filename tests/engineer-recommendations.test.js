import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { replan } from '../server/application/planning.js';
import { recommendEngineers } from '../server/application/engineer-recommendations.js';
import { previewAction, activateCandidate } from '../server/application/candidates.js';
import { pointKey } from '../server/optimization/travel.js';
const offline = { roads: false, iterations: 0 };
const travel = { matrix: {}, source: 'estimate', detail: 'test' };
async function fixture() {
  const s = createScenario({ count: 2, engineerCount: 4 });
  s.settings.balanceWork = false;
  for (const e of s.engineers) {
    e.skills = ['local'];
    e.transport = 'foot';
    e.shiftEnd = 1000;
  }
  for (const j of s.jobs)
    Object.assign(j, s.engineers[0].position, {
      type: 'local',
      skills: ['local'],
      windowStart: 480,
      windowEnd: 900,
      duration: 30,
      priority: 'normal',
    });
  Object.assign(s.jobs[0], { status: 'manual_review', priority: 'urgent', engineerId: null });
  s.jobs[1].pinnedEngineerId = s.engineers[0].id;
  await replan(s, offline);
  return s;
}
const recommend = (s, job = s.jobs[0], opts = {}) =>
  recommendEngineers(s, { expectedRevision: s.revision, job }, { travel, ...opts });
test('returns three feasible ranked engineers, explains delay and never mutates the day', async () => {
  const s = await fixture(),
    before = structuredClone(s);
  const result = await recommend(s);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.feasibleCount, 4);
  assert.equal(result.candidates[0].engineerId, 'eng-2');
  assert.equal(result.candidates[0].start, 480);
  assert.equal(result.candidates[0].delayedJobs, 0);
  assert.deepEqual(s, before);
  const selected = result.candidates[0].engineerId;
  const preview = await previewAction(
    s,
    {
      type: 'job.resolve',
      expectedRevision: s.revision,
      payload: { ...s.jobs[0], pinnedEngineerId: selected, confirmationNote: 'Клиент подтвердил' },
    },
    offline,
  );
  assert(preview.canApply);
  assert.deepEqual(s, before);
  const next = activateCandidate(s, preview, s.revision);
  assert.equal(next.jobs[0].engineerId, selected);
  assert.equal(next.jobs[0].pinnedEngineerId, selected);
});
test('resources, time windows and shifts exclude impossible engineers; no filler candidates', async () => {
  const s = await fixture();
  s.engineers[1].skills = ['emergency'];
  s.engineers[2].transport = 'none';
  s.engineers[3].shiftEnd = 490;
  const result = await recommend(s);
  assert.deepEqual(
    result.candidates.map((c) => c.engineerId),
    ['eng-1'],
  );
  assert.equal(result.excluded.incompatible, 2);
  assert.equal(result.excluded.schedule, 1);
  s.engineers[0].equipment = [];
  assert.equal((await recommend(s, { ...s.jobs[0], equipment: ['tester'] })).candidates.length, 0);
});
test('active trips remain locked, breaks and future shifts affect availability', async () => {
  const s = await fixture(),
    j = s.jobs[1];
  j.status = 'working';
  j.actualStart = 480;
  j.duration = 60;
  j.lockedStop = { ...s.plan.routes[0].stops[0], start: 480, end: 540 };
  s.plan.routes[0].locked = j.lockedStop;
  s.engineers[1].pausedUntil = 550;
  s.engineers[2].shiftStart = 560;
  s.engineers[3].transport = 'none';
  const result = await recommend(s);
  assert.deepEqual(
    result.candidates.map((c) => c.start),
    [540, 550, 560],
  );
  assert.equal(result.candidates[0].activeJobId, j.id);
  assert.equal(j.status, 'working');
});
test('insertion preserves ordinary client windows and evaluates each possible position', async () => {
  const s = await fixture();
  s.engineers = [s.engineers[0]];
  s.jobs[1].windowEnd = 480;
  const result = await recommend(s);
  assert.equal(result.candidates[0].jobsBefore, 1);
  assert.equal(result.candidates[0].start, 510);
  assert.equal(result.candidates[0].delayedJobs, 0);
  assert.equal((await recommend(s, { ...s.jobs[0], windowEnd: 500 })).candidates.length, 0);
});
test('edited coordinates use the supplied travel matrix, including unreachable paths', async () => {
  const s = await fixture();
  s.engineers = [s.engineers[0]];
  const job = { ...s.jobs[0], lat: s.jobs[0].lat + 0.01 };
  const key = `foot:${pointKey(s.engineers[0].position)}|${pointKey(job)}`;
  assert.equal(
    (await recommend(s, job, { travel: { ...travel, matrix: { [key]: null } } })).candidates.length,
    0,
  );
  const result = await recommend(s, job, {
    travel: { ...travel, matrix: { [key]: { minutes: 7, km: 0.5, estimated: false, mode: 'foot' } } },
  });
  assert.equal(result.candidates[0].arrival, 487);
  assert.equal(result.candidates[0].estimated, false);
});
test('rejects stale revisions, invalid coordinates and requests outside urgent approval', async () => {
  const s = await fixture();
  await assert.rejects(
    () => recommendEngineers(s, { expectedRevision: s.revision - 1, job: s.jobs[0] }),
    /изменился/,
  );
  await assert.rejects(() => recommend(s, { ...s.jobs[0], lat: null }), /координат/i);
  await assert.rejects(() => recommend(s, { ...s.jobs[0], priority: 'normal' }), /срочной/);
  await assert.rejects(() => recommend(s, s.jobs[1]), /согласовании/);
});

test('Gantt windows cover exactly feasible starts including waits, travel and later client deadlines', async () => {
  const s = await fixture();
  s.engineers = [s.engineers[0]];
  Object.assign(s.jobs[1], { windowStart: 700, windowEnd: 710 });
  await replan(s, offline);
  const before = structuredClone(s);
  const result = await recommend(s);
  const timeline = result.candidates[0].timeline;
  assert.deepEqual(timeline.windows, [
    { start: 480, latestStart: 680, jobsBefore: 0 },
    { start: 730, latestStart: 900, jobsBefore: 1 },
  ]);
  assert.equal(timeline.current[0].start, 700);
  assert.equal(timeline.proposed.find((v) => v.jobId === s.jobs[0].id).start, 480);
  const { createEvaluator } = await import('../server/optimization/evaluate.js');
  const { legFunction } = await import('../server/optimization/travel.js');
  for (let start = 479; start <= 901; start++) {
    const trial = structuredClone(s);
    Object.assign(trial.jobs[0], {
      status: 'pending',
      windowStart: start,
      windowEnd: Math.min(start, s.jobs[0].windowEnd),
    });
    const evaluate = createEvaluator(trial, legFunction({}));
    const feasible = Boolean(
      evaluate(trial.engineers[0], trial.jobs) || evaluate(trial.engineers[0], [...trial.jobs].reverse()),
    );
    assert.equal(
      timeline.windows.some((w) => start >= w.start && start <= w.latestStart),
      feasible,
      `start ${start}`,
    );
  }
  assert.deepEqual(s, before);
  const job = { ...s.jobs[0], lat: s.jobs[0].lat + 0.01 };
  const from = pointKey(s.engineers[0].position),
    to = pointKey(job);
  const roads = {
    ...travel,
    matrix: {
      [`foot:${from}|${to}`]: { minutes: 7, km: 0.5, estimated: false, mode: 'foot' },
      [`foot:${to}|${from}`]: { minutes: 11, km: 0.5, estimated: false, mode: 'foot' },
    },
  };
  const driven = (await recommend(s, job, { travel: roads })).candidates[0].timeline;
  assert.deepEqual(driven.windows, [
    { start: 487, latestStart: 669, jobsBefore: 0 },
    { start: 737, latestStart: 900, jobsBefore: 1 },
  ]);
});

test('Gantt keeps a single exact start, current locked work and pause boundaries', async () => {
  const s = await fixture();
  s.engineers = [s.engineers[0]];
  s.jobs[1].status = 'working';
  s.jobs[1].actualStart = 480;
  s.jobs[1].lockedStop = { ...s.plan.routes[0].stops[0], start: 480, end: 510 };
  s.engineers[0].pausedUntil = 550;
  const candidate = (await recommend(s, { ...s.jobs[0], windowEnd: 550 })).candidates[0];
  assert.deepEqual(candidate.timeline.windows, [{ start: 550, latestStart: 550, jobsBefore: 0 }]);
  assert.equal(candidate.timeline.current[0].locked, true);
  assert.equal(candidate.timeline.proposed[0].jobId, s.jobs[1].id);
  assert.equal(candidate.timeline.pausedUntil, 550);
  assert.equal(candidate.timeline.proposed[1].start, 550);
});

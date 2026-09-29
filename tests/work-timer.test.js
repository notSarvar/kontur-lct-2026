import test from 'node:test';
import assert from 'node:assert/strict';
import { startWorkTimer, finishWorkTimer } from '../server/domain/work-timer.js';
import { engineerAction } from '../server/domain/engineer-actions.js';
function fixture() {
  const job = {
    id: 'j',
    number: 1,
    engineerId: 'e',
    status: 'enroute',
    arrivedAt: 540,
    windowStart: 540,
    windowEnd: 900,
    duration: 30,
  };
  return {
    revision: 1,
    time: 540,
    jobs: [job],
    engineers: [{ id: 'e', shiftEnd: 1080 }],
    plan: { routes: [] },
    history: [],
    notifications: [],
    support: [],
  };
}
test('manual timer survives serialization and captures seconds independently of simulation time', () => {
  let s = fixture(),
    j = s.jobs[0];
  j.actualStart = 540;
  startWorkTimer(j, 'manual', 10000);
  s = JSON.parse(JSON.stringify(s));
  j = s.jobs[0];
  const r = finishWorkTimer(s, j, 'e', 'partial', 75000);
  assert.equal(r.durationSeconds, 65);
  assert.equal(r.deviationSeconds, -1735);
  assert.equal(r.source, 'manual');
  assert.equal(r.engineerId, 'e');
});
test('simulation records its own duration, not wall time', () => {
  const s = fixture(),
    j = s.jobs[0];
  j.actualStart = 540;
  startWorkTimer(j, 'simulation', 10000);
  s.time = 580;
  const r = finishWorkTimer(s, j, 'e', 'complete', 11000);
  assert.equal(r.durationSeconds, 2400);
  assert.equal(r.deviationSeconds, 600);
});
for (const outcome of ['complete', 'partial', 'failed'])
  test(`start and ${outcome} write exactly one measurement; duplicate finish rejected`, () => {
    const s = fixture();
    engineerAction(s, 'job.start', { id: 'j', expectedRevision: 1 });
    assert.equal(s.jobs[0].workTimer.source, 'manual');
    engineerAction(s, 'job.finish', { id: 'j', expectedRevision: 1, outcome, comment: 'Результат' });
    assert.equal(s.history.filter((x) => x.type === 'engineer.work.duration').length, 1);
    assert.throws(() => engineerAction(s, 'job.finish', { id: 'j', expectedRevision: 1, outcome }));
    assert.equal(s.history.filter((x) => x.type === 'engineer.work.duration').length, 1);
  });

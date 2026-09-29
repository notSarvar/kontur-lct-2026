import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { engineerMetrics } from '../server/domain/engineer-metrics.js';
import { solve } from '../server/optimization/solver.js';
import { applyAction } from '../server/application/actions.js';
import { replan } from '../server/application/planning.js';
import { ensureSops } from '../server/domain/sop.js';
import { exportScenario } from '../server/domain/export.js';
const offline = { roads: false, iterations: 0 };
function scenario() {
  const s = createScenario({ count: 1, engineerCount: 2 });
  s.engineers[1] = { ...structuredClone(s.engineers[0]), id: 'eng-2', name: 'Инженер 02' };
  s.jobs[0] = {
    ...s.jobs[0],
    ...s.engineers[0].position,
    type: 'local',
    skills: ['local'],
    duration: 60,
    windowStart: 480,
    windowEnd: 1000,
    priority: 'normal',
  };
  s.settings.balanceWork = true;
  s.settings.autoChecklists = false;
  return s;
}
test('historical onsite load favours a less loaded compatible engineer, but never overrides a pin', () => {
  const s = scenario();
  s.engineers[0].workHistory = { workMinutes: 450, availableMinutes: 540, label: 'Вчера' };
  s.engineers[1].workHistory = { workMinutes: 30, availableMinutes: 540, label: 'Вчера' };
  let p = solve(s, {}, { iterations: 0 });
  assert.equal(p.routes.find((r) => r.stops.length).engineerId, 'eng-2');
  s.jobs[0].pinnedEngineerId = 'eng-1';
  p = solve(s, {}, { iterations: 0 });
  assert.equal(p.routes.find((r) => r.stops.length).engineerId, 'eng-1');
  s.jobs[0].pinnedEngineerId = null;
  s.engineers[1].skills = ['emergency'];
  assert.equal(solve(s).routes.find((r) => r.stops.length).engineerId, 'eng-1');
});
test('past and remaining work/travel/wait/break/free partition the shift without double-counting locked work', () => {
  const s = scenario(),
    e = s.engineers[0],
    j = s.jobs[0];
  e.shiftEnd = 600;
  e.breaks = [{ start: 480, end: 490 }];
  s.time = 540;
  const stop = {
    jobId: j.id,
    depart: 490,
    arrival: 510,
    start: 520,
    end: 560,
    km: 3.2,
    estimated: true,
    locked: true,
  };
  Object.assign(j, { engineerId: e.id, status: 'working', actualStart: 520, lockedStop: stop });
  const m = engineerMetrics(s, e, { stops: [stop], locked: stop });
  assert.deepEqual(m.past, { work: 20, travel: 20, wait: 10, break: 10, free: 0, km: 3.2 });
  assert.deepEqual(m.remaining, { work: 20, travel: 0, wait: 0, break: 0, free: 40, km: 0 });
  assert.equal(m.projected.work, 40);
  assert.equal(m.utilization, 40 / 110);
  assert.equal(
    ['work', 'travel', 'wait', 'break', 'free'].reduce((n, k) => n + m.projected[k], 0),
    120,
  );
  j.status = 'done';
  j.actualEnd = 535;
  s.time = 540;
  const ended = engineerMetrics(s, e, { stops: [] });
  assert.equal(ended.past.work, 15);
  assert.equal(ended.projected.km, 3.2);
});
test('work history is normalized by available time rather than raw minutes alone', () => {
  const s = scenario();
  s.engineers[0].workHistory = { workMinutes: 300, availableMinutes: 3000, label: 'Период' };
  s.engineers[1].workHistory = { workMinutes: 120, availableMinutes: 540, label: 'Период' };
  assert.equal(solve(s, {}, { iterations: 0 }).routes.find((r) => r.stops.length).engineerId, 'eng-1');
});
test('an interrupted visit retains past work after dispatch returns it to planning', async () => {
  let s = scenario();
  await replan(s, offline);
  const route = s.plan.routes.find((r) => r.stops.length),
    j = s.jobs[0],
    stop = route.stops[0];
  s = await applyAction(s, { type: 'clock', payload: { time: stop.start + 10 } }, offline);
  s = await applyAction(s, { type: 'job.issue', payload: { id: j.id, text: 'Нужен доступ' } }, offline);
  assert.equal(s.jobs[0].attempts.length, 1);
  assert.equal(s.plan.engineerMetrics.find((m) => m.engineerId === route.engineerId).past.work, 10);
  s = await applyAction(s, { type: 'support.resolve', payload: { id: s.support.at(-1).id } }, offline);
  assert.equal(s.plan.engineerMetrics.find((m) => m.engineerId === route.engineerId).past.work, 10);
});
test('standard SOPs do not override official duration; template edits leave job copies and checkmarks intact', async () => {
  let s = scenario();
  s.jobs[0].type = 'connection';
  s.jobs[0].duration = 70;
  await replan(s, offline);
  const j = s.jobs[0],
    id = j.id;
  assert.equal(j.sop.templateId, 'connection');
  assert.equal(j.duration, 70);
  s = await applyAction(
    s,
    { type: 'job.sop.check', payload: { id, expectedRevision: s.revision, prerequisitesConfirmed: true } },
    offline,
  );
  s = await applyAction(
    s,
    {
      type: 'job.sop.check',
      payload: { id, expectedRevision: s.revision, stepId: j.sop.steps[0].id, done: true },
    },
    offline,
  );
  const template = structuredClone(s.sopTemplates.find((t) => t.id === 'connection'));
  template.steps[0].text = 'Изменённый шаг';
  s = await applyAction(
    s,
    { type: 'sop.template.save', payload: { id: 'connection', sop: template, expectedRevision: s.revision } },
    offline,
  );
  assert.notEqual(s.jobs[0].sop.steps[0].text, 'Изменённый шаг');
  assert.equal(s.jobs[0].sop.steps[0].done, true);
  assert.equal(s.sopTemplates.find((t) => t.id === 'connection').version, 2);
  s = await applyAction(s, { type: 'optimize' }, offline);
  assert.equal(s.jobs[0].sop.steps[0].done, true);
  assert.equal(s.jobs[0].duration, 70);
  await assert.rejects(
    () =>
      applyAction(
        s,
        { type: 'job.sop.apply', payload: { id, templateId: 'router', expectedRevision: s.revision } },
        offline,
      ),
    /выполненными/,
  );
  await assert.rejects(
    () =>
      applyAction(
        s,
        { type: 'job.sop.save', payload: { id, sop: s.jobs[0].sop, expectedRevision: 0 } },
        offline,
      ),
    /изменились/,
  );
});
test('SOP edits reset only changed checkmarks; diagnostics never mark an incident completed', async () => {
  let s = scenario();
  s.jobs[0].type = 'emergency';
  ensureSops(s);
  await replan(s, offline);
  const id = s.jobs[0].id;
  assert.equal(s.jobs[0].sop.diagnosticsOnly, true);
  await assert.rejects(
    () =>
      applyAction(
        s,
        {
          type: 'job.sop.check',
          payload: { id, expectedRevision: s.revision, stepId: s.jobs[0].sop.steps[0].id, done: true },
        },
        offline,
      ),
    /условия/,
  );
  s = await applyAction(
    s,
    { type: 'job.sop.check', payload: { id, expectedRevision: s.revision, prerequisitesConfirmed: true } },
    offline,
  );
  for (const step of s.jobs[0].sop.steps)
    s = await applyAction(
      s,
      { type: 'job.sop.check', payload: { id, expectedRevision: s.revision, stepId: step.id, done: true } },
      offline,
    );
  assert.equal(s.jobs[0].status, 'pending');
  const sop = structuredClone(s.jobs[0].sop);
  sop.steps[0].text = 'Уточнить симптомы';
  s = await applyAction(
    s,
    { type: 'job.sop.save', payload: { id, sop, expectedRevision: s.revision } },
    offline,
  );
  assert.equal(s.jobs[0].sop.steps[0].done, false);
  assert.equal(s.jobs[0].sop.steps[1].done, true);
  const imported = await applyAction(s, { type: 'import', payload: exportScenario(s) }, offline);
  assert.equal(imported.jobs[0].sop.steps[0].text, 'Уточнить симптомы');
  assert(imported.jobs[0].sop.steps.every((step) => !step.done));
});
test('additional search never loses the incumbent and invalid budgets are rejected', async () => {
  const s = createScenario({ count: 18, engineerCount: 4 });
  const short = solve(s, {}, { iterations: 20, restarts: 1 }),
    long = solve(s, {}, { iterations: 20, restarts: 3 });
  const { compare } = await import('../server/optimization/evaluate.js');
  assert(compare(long.objective, short.objective) <= 0);
  await assert.rejects(
    () => applyAction(s, { type: 'settings', payload: { ...s.settings, alnsRestarts: 100 } }, offline),
    /запусков/,
  );
});

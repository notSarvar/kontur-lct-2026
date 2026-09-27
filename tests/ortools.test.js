import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createScenario } from '../server/domain/scenario.js';
import { solveSelected, compareSolvers } from '../server/optimization/runner.js';
import { createEvaluator } from '../server/optimization/evaluate.js';
import { legFunction, pointKey } from '../server/optimization/travel.js';
import { solve } from '../server/optimization/solver.js';
const available =
  Boolean(process.env.ORTOOLS_PYTHON) ||
  existsSync(new URL('../.venv-optimizer/bin/python', import.meta.url));
test(
  'actual OR-Tools agrees with exhaustive open-route enumeration on a small instance',
  { skip: !available },
  async () => {
    const s = createScenario({ count: 5, engineerCount: 1 });
    s.settings = {
      ...s.settings,
      solver: 'ortools',
      ortoolsSeconds: 5,
      balanceWork: false,
      stability: false,
    };
    for (const j of s.jobs)
      Object.assign(j, {
        skills: ['local'],
        priority: 'normal',
        windowStart: 480,
        windowEnd: 1300,
        duration: 30,
      });
    const evaluate = createEvaluator(s, legFunction());
    const permutations = (a) =>
      a.length ? a.flatMap((v, i) => permutations(a.filter((_, k) => k !== i)).map((p) => [v, ...p])) : [[]];
    const expected = Math.min(
      ...permutations(s.jobs).map((p) => evaluate(s.engineers[0], p)?.distanceCost ?? Infinity),
    );
    const p = await solveSelected(s);
    assert.equal(p.solver, 'ortools');
    assert.equal(p.metrics.assigned, 5);
    assert.equal(p.routes[0].distanceCost, expected);
    assert(p.diagnostics.found);
    assert(p.diagnostics.allStagesOptimal);
  },
);
test(
  'OR-Tools uses historical workload and respects pins, unreachable arcs and active commitments',
  { skip: !available },
  async () => {
    const s = createScenario({ count: 2, engineerCount: 2 });
    s.engineers[1] = { ...structuredClone(s.engineers[0]), id: 'eng-2', name: 'Второй' };
    s.engineers[0].workHistory = { workMinutes: 450, availableMinutes: 540, label: 'Вчера' };
    s.engineers[1].workHistory = { workMinutes: 30, availableMinutes: 540, label: 'Вчера' };
    for (const j of s.jobs)
      Object.assign(j, {
        ...s.engineers[0].position,
        skills: ['local'],
        priority: 'normal',
        windowStart: 480,
        windowEnd: 1100,
        duration: 30,
      });
    s.settings = { ...s.settings, solver: 'ortools', ortoolsSeconds: 3, balanceWork: true };
    let p = await solveSelected(s);
    assert.equal(p.routes.find((r) => r.stops.length).engineerId, 'eng-2');
    s.jobs[0].pinnedEngineerId = 'eng-1';
    s.jobs[1].pinnedEngineerId = 'eng-2';
    p = await solveSelected(s);
    assert(p.routes.every((r) => r.stops.length === 1));
    const before = JSON.stringify(s);
    const result = await compareSolvers(s, {}, { ortoolsSeconds: 3 });
    assert.equal(JSON.stringify(s), before);
    assert(result.sameAssignedJobs);
    const active = s.jobs[0],
      locked = p.routes[0].stops[0];
    Object.assign(active, {
      status: 'working',
      engineerId: 'eng-1',
      actualStart: locked.start,
      lockedStop: locked,
    });
    s.time = locked.start + 10;
    s.plan = p;
    const key = `${s.engineers[1].transport}:${pointKey(s.engineers[1].position)}|${pointKey(s.jobs[1])}`;
    const blocked = await solveSelected(s, { [key]: null });
    assert.equal(blocked.routes[0].stops[0].jobId, active.id);
    assert.equal(blocked.routes[0].stops[0].locked, true);
    assert(blocked.unassigned.some((j) => j.jobId === s.jobs[1].id));
  },
);
test('external solutions are validated for duplicate IDs and feasibility before publication', () => {
  const s = createScenario({ count: 1, engineerCount: 1 });
  assert.throws(() => solve(s, {}, { externalLists: [[s.jobs[0].id, s.jobs[0].id]] }), /duplicate/);
  s.jobs[0].skills = ['emergency'];
  s.engineers[0].skills = ['local'];
  assert.throws(() => solve(s, {}, { externalLists: [[s.jobs[0].id]] }), /infeasible/);
});

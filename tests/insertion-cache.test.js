import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { createEvaluator, objective } from '../server/optimization/evaluate.js';
import { legFunction } from '../server/optimization/travel.js';
import { emptySolution, repair } from '../server/optimization/search.js';

test('cached insertion reuses only unchanged routes and preserves exact assignments/objective', () => {
  for (const mode of ['economy', 'emergency'])
    for (const balanceWork of [false, true])
      for (const regret of [false, true])
        for (const seed of [1, 7, 42]) {
          const s = createScenario({ count: 25, engineerCount: 6, seed });
          s.settings = { ...s.settings, mode, balanceWork };
          s.engineers[0].workHistory = { workMinutes: 300, availableMinutes: 540, label: 'Yesterday' };
          s.jobs[3].pinnedEngineerId = s.engineers[1].id;
          const original = createEvaluator(s, legFunction()),
            calls = { cached: 0, plain: 0 };
          function counted(key) {
            const f = (...args) => {
              calls[key]++;
              return original(...args);
            };
            f.mode = original.mode;
            f.compatible = original.compatible;
            return f;
          }
          const a = counted('cached'),
            b = counted('plain');
          const cached = repair(emptySolution(s.engineers, a), s.jobs, s.engineers, a, regret);
          const plain = repair(emptySolution(s.engineers, b), s.jobs, s.engineers, b, regret, {
            cacheInsertions: false,
          });
          assert.deepEqual(
            cached.lists.map((l) => l.map((j) => j.id)),
            plain.lists.map((l) => l.map((j) => j.id)),
          );
          assert.deepEqual(cached.unassigned, plain.unassigned);
          assert.deepEqual(objective(cached), objective(plain));
          assert(calls.cached <= calls.plain);
          if (regret) assert(calls.cached < calls.plain, 'Regret repair must avoid repeated evaluation');
        }
});

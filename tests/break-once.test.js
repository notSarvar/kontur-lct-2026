import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../server/domain/scenario.js';
import { applyAction } from '../server/application/actions.js';
const opts = { roads: false, iterations: 0 };
const pause = (s, minutes) =>
  applyAction(s, { type: 'engineer.pause', payload: { id: s.engineers[0].id, minutes } }, opts);
test('one break per shift survives return, reload and elapsed time', async () => {
  let s = createScenario({ count: 1, engineerCount: 1, seed: 42 });
  s = await pause(s, 30);
  assert.equal(s.engineers[0].breakUsed, true);
  await assert.rejects(pause(s, 30), /Перерыв уже использован/);
  s = await pause(s, 0);
  s = JSON.parse(JSON.stringify(s));
  await assert.rejects(pause(s, 30), /Перерыв уже использован/);
  s.time += 60;
  await assert.rejects(pause(s, 30), /Перерыв уже использован/);
  const fresh = createScenario({ count: 1, engineerCount: 1, seed: 42 });
  await pause(fresh, 30);
});
test('legacy break history also consumes allowance; empty return does not', async () => {
  let s = createScenario({ count: 1, engineerCount: 1, seed: 42 });
  s = await pause(s, 0);
  assert.ok(!s.engineers[0].breakUsed);
  s.engineers[0].breaks = [{ start: 480, end: 510 }];
  s.time = 520;
  await assert.rejects(pause(s, 30), /Перерыв уже использован/);
});

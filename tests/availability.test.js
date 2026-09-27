import test from 'node:test';
import assert from 'node:assert/strict';
import { freeWindows } from '../src/features/team/availability.js';

const engineer = { id: 'e1', shiftStart: 480, shiftEnd: 1020, transport: 'transit' };
const state = (stops, time = 480) => ({ time, jobs: [], plan: { routes: [{ engineerId: 'e1', stops }] } });

test('free time excludes the whole departure, waiting and work interval', () => {
  const s = state([
    { depart: 510, start: 570, end: 630 },
    { depart: 660, start: 720, end: 780 },
  ]);
  assert.deepEqual(freeWindows(s, engineer, 30), [
    { start: 480, end: 510 },
    { start: 630, end: 660 },
    { start: 780, end: 1020 },
  ]);
  assert.deepEqual(freeWindows(s, engineer, 60), [{ start: 780, end: 1020 }]);
});

test('active visits, pauses, shift boundaries and unavailable transport are respected', () => {
  const s = state([{ depart: 490, start: 540, end: 600 }], 550);
  assert.deepEqual(freeWindows(s, engineer), [{ start: 600, end: 1020 }]);
  assert.deepEqual(freeWindows(s, { ...engineer, pausedUntil: 700 }), [{ start: 700, end: 1020 }]);
  assert.deepEqual(freeWindows(state([], 400), engineer), [{ start: 480, end: 1020 }]);
  assert.deepEqual(freeWindows(state([], 1010), engineer), []);
  assert.deepEqual(freeWindows(s, { ...engineer, transport: 'none' }), []);
  assert.deepEqual(freeWindows({ ...s, jobs: [{ engineerId: 'e1', status: 'blocked' }] }, engineer), []);
});

test('overlapping reserved intervals never create a false free slot', () => {
  const s = state([
    { depart: 600, start: 620, end: 700 },
    { depart: 500, start: 560, end: 650 },
  ]);
  assert.deepEqual(freeWindows(s, engineer), [{ start: 700, end: 1020 }]);
});

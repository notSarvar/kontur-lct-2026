import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createScenario } from '../server/domain/scenario.js';
import { applyAction } from '../server/application/actions.js';
import { replan } from '../server/application/planning.js';
import { persistState, loadState } from '../server/infrastructure/storage.js';
import { shiftKit, sopReady } from '../src/shared/shift-kit.js';
const opts = { roads: false, iterations: 0 };
async function fixture() {
  const s = createScenario({ count: 2, engineerCount: 1 });
  for (const j of s.jobs)
    Object.assign(j, s.engineers[0].position, {
      type: 'connection',
      skills: ['connection'],
      duration: 70,
      windowStart: 540,
      windowEnd: 1000,
      priority: 'normal',
    });
  await replan(s, opts);
  return s;
}
const act = (s, type, payload = {}) =>
  applyAction(s, { type, payload: { ...payload, expectedRevision: s.revision } }, opts);
async function pack(s) {
  for (const item of shiftKit(s, s.engineers[0]).items)
    s = await act(s, 'engineer.kit.check', { id: s.engineers[0].id, key: item.key, done: true });
  return s;
}
test('default simulation pre-fills both checklists and completes the day without user actions', async () => {
  let s = await fixture();
  assert(shiftKit(s, s.engineers[0]).ready);
  assert(s.jobs.every(sopReady));
  s = await act(s, 'clock', { time: 1000 });
  assert(s.jobs.every((j) => j.status === 'done'));
});
test('manual collection aggregates consumables, deduplicates tools, persists and rejects stale checks', async () => {
  let s = await act(await fixture(), 'simulation.checklists', { enabled: false });
  const kit = shiftKit(s, s.engineers[0]);
  assert.equal(kit.items.find((i) => i.label === 'Медный кабель').quantity, '50 м');
  assert.equal(kit.items.find((i) => i.label === 'Коннекторы').quantity, '8 шт.');
  assert.equal(kit.items.filter((i) => i.text === 'Ноутбук с Ethernet').length, 1);
  await assert.rejects(() => act(s, 'job.depart', { id: s.plan.routes[0].stops[0].jobId }), /комплект/);
  const advanced = await act(s, 'clock', { time: 490 });
  assert(advanced.jobs.every((j) => j.status === 'pending'));
  s = await pack(s);
  assert(shiftKit(s, s.engineers[0]).ready);
  await assert.rejects(
    () =>
      applyAction(
        s,
        {
          type: 'engineer.kit.check',
          payload: {
            id: s.engineers[0].id,
            key: kit.items[0].key,
            done: false,
            expectedRevision: s.revision - 1,
          },
        },
        opts,
      ),
    /изменились/,
  );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kontur-kit-'));
  try {
    await persistState(dir, s);
    const restored = await loadState(dir);
    assert.deepEqual(restored.engineers[0].kitChecks, s.engineers[0].kitChecks);
    assert(shiftKit(restored, restored.engineers[0]).ready);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
  const extra = structuredClone(s.jobs[0]);
  extra.id = 'additional-connection';
  s.jobs.push(extra);
  const changed = shiftKit(s, s.engineers[0]);
  assert.equal(changed.items.find((i) => i.label === 'Медный кабель').done, false);
  assert.equal(changed.items.find((i) => i.text === 'Ноутбук с Ethernet').done, true);
});
test('manual visit waits for window, checks SOP and completes only after explicit result', async () => {
  let s = await pack(await act(await fixture(), 'simulation.checklists', { enabled: false }));
  const id = s.plan.routes[0].stops[0].jobId;
  s = await act(s, 'job.depart', { id });
  s = await act(s, 'job.arrive', { id });
  await assert.rejects(() => act(s, 'job.start', { id }), /окно/);
  s = await act(s, 'clock', { time: 540 });
  assert.equal(s.jobs.find((j) => j.id === id).status, 'enroute');
  s = await act(s, 'job.start', { id });
  await assert.rejects(() => act(s, 'job.finish', { id, outcome: 'complete' }), /чек-лист/);
  await assert.rejects(() => act(s, 'job.complete', { id }), /чек-лист/);
  s = await act(s, 'job.sop.check', { id, prerequisitesConfirmed: true });
  for (const step of s.jobs.find((j) => j.id === id).sop.steps)
    s = await act(s, 'job.sop.check', { id, stepId: step.id, done: true });
  s = await act(s, 'clock', { time: 620 });
  assert.equal(s.jobs.find((j) => j.id === id).status, 'working');
  s = await act(s, 'job.finish', { id, outcome: 'complete' });
  assert.equal(s.jobs.find((j) => j.id === id).status, 'done');
  assert(s.notifications.some((n) => n.title === 'Результат визита получен'));
});
test('partial result requires explanation, keeps an actionable support ticket, auto mode resumes flow', async () => {
  let s = await pack(await act(await fixture(), 'simulation.checklists', { enabled: false }));
  const id = s.plan.routes[0].stops[0].jobId;
  s = await act(s, 'job.depart', { id });
  s = await act(s, 'job.arrive', { id });
  s = await act(s, 'clock', { time: 540 });
  s = await act(s, 'job.start', { id });
  await assert.rejects(() => act(s, 'job.finish', { id, outcome: 'partial' }), /Опишите/);
  s = await act(s, 'job.finish', { id, outcome: 'partial', comment: 'Нет доступа к порту' });
  assert.equal(s.jobs.find((j) => j.id === id).status, 'blocked');
  assert(s.support.some((t) => t.jobId === id && t.status === 'open'));
  s = await act(s, 'simulation.checklists', { enabled: true });
  assert(shiftKit(s, s.engineers[0]).ready);
  assert(s.jobs.every(sopReady));
  s = await act(s, 'clock', { time: 1000 });
  assert(s.jobs.some((j) => j.status === 'done'));
});

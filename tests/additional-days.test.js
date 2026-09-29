import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  loadOfficialDatasets,
  normalizeAdditionalCsv,
  normalizeOfficialCsv,
} from '../server/infrastructure/datasets.js';
import { createOfficialScenario } from '../server/domain/official-scenario.js';
import { applyAction } from '../server/application/actions.js';
import { createScenario } from '../server/domain/scenario.js';

test('six independent days preserve raw inputs, source statuses, dates and separate namespaces', async () => {
  const all = await loadOfficialDatasets(),
    extra = all.filter((d) => d.baseRegion);
  assert.equal(all.length, 9);
  assert.deepEqual(
    extra.map((d) => d.jobs.length),
    [74, 78, 87, 102, 77, 79],
  );
  assert.equal(new Set(all.flatMap((d) => d.jobs.map((j) => j.id))).size, 702);
  const manifest = JSON.parse(await fs.readFile(new URL('../data/beeline/sources.json', import.meta.url)));
  for (const d of extra) {
    const raw = await fs.readFile(new URL('../data/beeline/' + d.file, import.meta.url));
    assert.equal(
      createHash('sha256').update(raw).digest('hex'),
      manifest.files.find((f) => f.file === d.file).sha256,
    );
    assert.equal(d.date, new Set(d.jobs.map((j) => j.date)).values().next().value);
    assert.deepEqual(d.office, all.find((b) => b.id === d.baseRegion).office);
    assert(
      d.jobs.every(
        (j) =>
          j.status === 'pending' &&
          j.engineerId === null &&
          j.source.fields['Статус BK'] &&
          j.source.importPolicy === 'independent-replay-v1',
      ),
    );
  }
  const a = extra.find((d) => d.id === 'southcenter-day2'),
    b = extra.find((d) => d.id === 'southcenter-day3');
  assert.equal(a.date, b.date);
  assert.notEqual(a.jobs[0].id, b.jobs[0].id);
  a.jobs[0].status = 'done';
  assert.equal(b.jobs[0].status, 'pending');
});

test('extra day starts from exactly the original office and loads through the regular action', async () => {
  const base = new Map();
  for (const d of (await loadOfficialDatasets()).filter((d) => d.baseRegion)) {
    if (!base.has(d.baseRegion)) base.set(d.baseRegion, await createOfficialScenario(d.baseRegion));
    const s = await createOfficialScenario(d.id);
    assert.deepEqual(s.dataset.office, base.get(d.baseRegion).dataset.office);
    assert(
      s.engineers.every((e) => e.home.lat === s.dataset.office.lat && e.home.lng === s.dataset.office.lng),
    );
    const current = createScenario({ count: 0, engineerCount: 0 }),
      before = structuredClone(current);
    const next = await applyAction(
      current,
      { type: 'dataset.load', payload: { id: d.id } },
      { roads: false, iterations: 0 },
    );
    assert.equal(next.jobs.length, d.jobs.length);
    assert.equal(next.plan.metrics.assigned + next.plan.metrics.unassigned, d.jobs.length);
    assert.deepEqual(current, before);
  }
});

test('extra day adapter does not relax legacy guards or accept corrupt records', async () => {
  const d = (await loadOfficialDatasets()).find((d) => d.baseRegion);
  const text = new TextDecoder('windows-1251').decode(
    await fs.readFile(new URL('../data/beeline/' + d.file, import.meta.url)),
  );
  const norms = JSON.parse(await fs.readFile(new URL('../data/beeline/norms.json', import.meta.url)));
  assert.throws(() => normalizeOfficialCsv(text, d, norms), /Контрольное/);
  assert.throws(
    () => normalizeAdditionalCsv(text.replace('Гигабитное подключение', 'Бригада'), d, norms, d.office),
    /Некорректный формат/,
  );
  assert.throws(
    () => normalizeAdditionalCsv(text.replaceAll('28.09.2026', '31.02.2026'), d, norms, d.office),
    /Некорректная дата/,
  );
  assert.throws(() => normalizeAdditionalCsv(text, { ...d, count: 1 }, norms, d.office), /Количество заявок/);
});

test('the 102-job dataset supports JSON reimport and urgent/random arrivals with a bounded day size', async () => {
  const opts = { roads: false, iterations: 0 };
  let state = await applyAction(
    createScenario({ count: 0, engineerCount: 0 }),
    { type: 'dataset.load', payload: { id: 'southeast-day3' } },
    opts,
  );
  state = await applyAction(state, { type: 'import', payload: JSON.parse(JSON.stringify(state)) }, opts);
  assert.equal(state.jobs.length, 102);
  const example = state.jobs.find((j) => Number.isFinite(j.lat) && Number.isFinite(j.lng));
  state = await applyAction(
    state,
    {
      type: 'job.save',
      payload: { ...example, id: undefined, title: 'Срочный визит после импорта', priority: 'urgent' },
    },
    opts,
  );
  assert.equal(state.jobs.length, 103);
  state = await applyAction(state, { type: 'jobs.random', payload: { count: 3, seed: 12 } }, opts);
  assert.equal(state.jobs.length, 106);
  await assert.rejects(
    applyAction(
      state,
      { type: 'import', payload: { jobs: Array(201).fill(example), engineers: state.engineers } },
      opts,
    ),
    /1–200/,
  );
  const full = { ...state, jobs: Array(200).fill(example) };
  await assert.rejects(
    applyAction(full, { type: 'job.save', payload: { ...example, id: undefined } }, opts),
    /до 200/,
  );
  await assert.rejects(
    applyAction(full, { type: 'jobs.random', payload: { count: 1, seed: 1 } }, opts),
    /до 200/,
  );
});

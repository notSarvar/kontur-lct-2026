import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadOfficialDatasets,
  normalizeOfficialCsv,
  parseCsv,
  OFFICIAL_DATASETS,
} from '../server/infrastructure/datasets.js';

test('official synthetic imports preserve all requests, offices, windows and separate regions', async () => {
  const datasets = await loadOfficialDatasets();
  assert.deepEqual(
    datasets.map((d) => d.jobs.length),
    [66, 83, 56],
  );
  assert.equal(new Set(datasets.flatMap((d) => d.jobs.map((j) => j.id))).size, 205);
  for (const dataset of datasets) {
    assert.equal(dataset.date, '2026-08-17');
    assert.match(dataset.office.address, /Москва/);
    assert.equal(dataset.engineers, null);
    assert.equal(dataset.readiness.requiresGeocoding, dataset.jobs.length + 1);
    assert(dataset.jobs.every((j) => j.lat === null && j.lng === null));
    assert(dataset.jobs.every((j) => !('Бригада' in j.source.fields)));
  }
  assert.equal(datasets[0].jobs[0].number, '74198');
  assert.equal(datasets[0].jobs[0].windowEnd, 1320);
  assert.equal(datasets[1].jobs.filter((j) => j.windowStart === 1 && j.windowEnd === 1439).length, 11);
});

test('service duration uses technical work and documents once; all global problems follow the agreed emergency rule', async () => {
  const jobs = (await loadOfficialDatasets()).flatMap((d) => d.jobs);
  const minutes = { connection: 70, additional: 20, local: 30, emergency: 80 };
  for (const job of jobs.filter((j) => !j.review.length)) {
    assert.equal(job.duration, minutes[job.type]);
    if (job.type === 'additional') assert.deepEqual(job.skills, ['connection']);
  }
  const unresolved = jobs.filter((j) => j.review.length);
  assert.equal(unresolved.length, 0);
  assert.equal(
    jobs.filter((j) => j.type === 'emergency' && j.priority === 'urgent' && j.duration === 80).length,
    21,
  );
  assert(unresolved.every((j) => j.duration === null && j.priority === null));
});

test('CSV parsing handles quoted addresses without silently accepting broken records', () => {
  assert.deepEqual(parseCsv('\uFEFFa;b\r\n"ул.; дом ""А""";"строка\nдва"\r\n;;\r\n'), [
    ['a', 'b'],
    ['ул.; дом "А"', 'строка\nдва'],
  ]);
  assert.throws(() => parseCsv('a;"broken'), /Незакрытая/);
  assert.throws(() => parseCsv('a;"value"tail'), /кавычки/);
});

test('duplicate IDs and malformed dates stop import rather than alter the scheduling input', async () => {
  const dataset = OFFICIAL_DATASETS[0];
  const bytes = await readFile(new URL(`../data/beeline/${dataset.file}`, import.meta.url));
  const text = new TextDecoder('windows-1251').decode(bytes);
  const norms = JSON.parse(await readFile(new URL('../data/beeline/norms.json', import.meta.url), 'utf8'));
  assert.throws(() => normalizeOfficialCsv(text.replace('86160;', '74198;'), dataset, norms), /повторный ID/);
  assert.throws(
    () => normalizeOfficialCsv(text.replace('17.08.2026 20:00', '31.02.2026 20:00'), dataset, norms),
    /Некорректная дата/,
  );
  assert.throws(
    () => normalizeOfficialCsv(text.replace('Гигабитное подключение', 'Бригада'), dataset, norms),
    /Контрольное/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createOfficialScenario } from '../server/domain/official-scenario.js';
import { createScenario } from '../server/domain/scenario.js';
import { solve } from '../server/optimization/solver.js';
import { migrateWorkPolicy } from '../server/domain/policy-migration.js';
import { pointKey } from '../server/optimization/travel.js';
import { exportScenario } from '../server/domain/export.js';
import { applyAction } from '../server/application/actions.js';

test('legacy exported source data receives the new policy during import', async () => {
  const state = await createOfficialScenario('southcenter');
  const payload = exportScenario(state);
  delete payload.catalogVersion;
  const info = payload.jobs.find((j) => j.type === 'information');
  info.type = 'emergency';
  info.priority = 'urgent';
  info.duration = 80;
  delete info.source.policyVersion;
  const imported = await applyAction(state, { type: 'import', payload }, { roads: false, iterations: 20 });
  const updated = imported.jobs.find((j) => j.id === info.id);
  assert.equal(updated.priority, 'normal');
  assert.equal(updated.duration, 30);
  assert.equal(updated.type, 'information');
  assert.equal(updated.source.policyVersion, imported.catalogVersion);
});

test('six visits at one point keep all service work and only one incoming trip', () => {
  for (const routed of [false, true]) {
    const s = createScenario({ count: 6, engineerCount: 1 });
    s.engineers[0].skills = ['emergency'];
    s.engineers[0].transport = 'foot';
    const home = s.engineers[0].home,
      site = { lat: home.lat + 0.005, lng: home.lng };
    for (const j of s.jobs)
      Object.assign(j, {
        ...site,
        skills: ['emergency'],
        type: 'emergency',
        priority: 'urgent',
        duration: 80,
        windowStart: 1,
        windowEnd: 1439,
      });
    const matrix = routed
      ? {
          [`foot:${pointKey(home)}|${pointKey(site)}`]: {
            minutes: 12,
            km: 0.8,
            mode: 'foot',
            estimated: false,
          },
          [`foot:${pointKey(site)}|${pointKey(site)}`]: { minutes: 0, km: 0, mode: 'foot', estimated: false },
        }
      : {};
    const plan = solve(s, matrix),
      stops = plan.routes[0].stops;
    assert.equal(stops.length, 6);
    assert.equal(new Set(stops.map((j) => j.jobId)).size, 6);
    assert.equal(
      stops.reduce((sum, stop) => sum + stop.end - stop.start, 0),
      480,
    );
    assert(stops[0].travel > 0);
    assert(stops.slice(1).every((stop) => stop.travel === 0));
    assert.equal(plan.metrics.travel, stops[0].travel);
  }
});

test('policy migration corrects future source rows without resetting staff, windows, manual duration or begun work', async () => {
  const s = await createOfficialScenario('east');
  delete s.catalogVersion;
  const infos = s.jobs.filter((j) => j.type === 'information');
  for (const j of infos) {
    j.type = 'emergency';
    j.duration = 80;
    j.priority = 'urgent';
    delete j.source.policyVersion;
  }
  infos[1].duration = 45;
  infos[1].windowStart = 900;
  infos[2].status = 'working';
  infos[2].actualStart = 800;
  const begun = structuredClone(infos[2]);
  const additional = s.jobs.find((j) => j.type === 'additional');
  additional.skills = ['connection'];
  delete additional.source.policyVersion;
  const engineer = s.engineers.find((e) => e.skills.includes('connection'));
  engineer.name = 'Сохранённое имя';
  const count = s.engineers.length;
  const norms = JSON.parse(await fs.readFile(new URL('../data/beeline/norms.json', import.meta.url), 'utf8'));
  assert.equal(migrateWorkPolicy(s, norms), true);
  assert.equal(infos[0].type, 'information');
  assert.equal(infos[0].priority, 'normal');
  assert.equal(infos[0].duration, 30);
  assert.equal(infos[1].duration, 45);
  assert.equal(infos[1].windowStart, 900);
  assert.deepEqual(infos[2], begun);
  assert.equal(s.engineers.length, count);
  assert.equal(engineer.name, 'Сохранённое имя');
  assert(engineer.skills.includes('additional'));
  assert.deepEqual(additional.skills, ['additional']);
  assert.equal(migrateWorkPolicy(s, norms), false);
});

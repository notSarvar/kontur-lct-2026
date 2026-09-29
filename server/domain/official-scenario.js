import { loadOfficialDatasets } from '../infrastructure/datasets.js';
import fs from 'node:fs/promises';
import { readGeocache, resolvedPoint, normalizeAddress } from '../infrastructure/geocoding.js';
import { createScenario } from './scenario.js';
import { SKILLS, COLORS } from './catalog.js';
import { OFFICIAL_POLICY } from './official-policy.js';

export function deriveEngineers(jobs, office, regionId) {
  const engineers = [],
    demand = [];
  for (const skill of Object.keys(SKILLS)) {
    const eligible = jobs.filter((j) => j.skills.includes(skill));
    if (!eligible.length) continue;
    for (const shift of [
      { name: 'ранняя', start: 480, end: 1020 },
      { name: 'поздняя', start: 840, end: 1380 },
    ]) {
      // Split overlap evenly. Include a transparent 20-minute travel allowance from
      // the supplied norm only for pool sizing, never as extra service time.
      const minutes = eligible.reduce((sum, j) => {
        const early = j.windowStart < 1020,
          late = j.windowEnd >= 840;
        const included = shift.start === 480 ? early : late;
        return sum + (included ? (j.duration + 20) / (Number(early) + Number(late)) : 0);
      }, 0);
      if (!minutes) continue;
      const count = Math.max(1, Math.ceil(minutes / ((shift.end - shift.start) * 0.65)));
      demand.push({ skill, shift: shift.name, workloadMinutes: Math.round(minutes), count });
      for (let n = 0; n < count; n++) {
        const i = engineers.length;
        engineers.push({
          id: `${regionId}:eng-${i + 1}`,
          name: `Инженер ${String(i + 1).padStart(2, '0')}`,
          color: COLORS[i % COLORS.length],
          skills: [skill],
          equipment: [],
          transport: 'transit',
          synthetic: true,
          profile: `${SKILLS[skill]} · ${shift.name} смена`,
          shiftStart: shift.start,
          shiftEnd: shift.end,
          home: { ...office },
          position: { ...office },
          pausedUntil: 0,
        });
      }
    }
  }
  return {
    engineers,
    demand,
    method:
      'Пул по каждому навыку и двум сменам: работа + 20 минут условной дороги на заявку; 65% доступной смены, пересекающиеся окна делятся между сменами. Это допущение о штате, а не результат оптимизации.',
  };
}

export async function createOfficialScenario(id) {
  const dataset = (await loadOfficialDatasets()).find((d) => d.id === id);
  if (!dataset) throw Object.assign(new Error('Неизвестный участок'), { status: 400 });
  const cache = await readGeocache();
  const assumptions = JSON.parse(
    await fs.readFile(new URL('../../data/beeline/office-assumptions.json', import.meta.url), 'utf8'),
  );
  const office = {
    ...dataset.office,
    ...assumptions[dataset.baseRegion || id],
    ...resolvedPoint(dataset.office.address, cache),
  };
  const jobs = dataset.jobs.map((job) => ({
    ...job,
    ...resolvedPoint(job.address, cache),
    createdAt: 0,
    geocodingCandidates: cache[normalizeAddress(job.address)]?.candidates || [],
  }));
  const roster = deriveEngineers(jobs, office, id);
  return {
    ...createScenario({ count: 0, engineerCount: 0 }),
    jobs,
    engineers: roster.engineers,
    nextNumber: 1 + Math.max(...jobs.map((j) => Number(j.number))),
    dataset: {
      id,
      name: dataset.name,
      baseRegion: dataset.baseRegion || id,
      independentReplay: dataset.format === 'additional-day',
      date: dataset.date,
      policyVersion: OFFICIAL_POLICY.version,
      office,
      roster: { method: roster.method, demand: roster.demand },
      source: dataset.file,
    },
  };
}

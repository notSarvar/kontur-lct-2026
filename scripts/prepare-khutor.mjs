// Synthetic geometry explicitly authorised by the user. No geocoding calls and
// no claim that generated coordinates identify the named buildings/districts.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { inputs, root } from './khutor-data.mjs';
import { deriveEngineers } from '../server/domain/official-scenario.js';
import { createScenario, rng } from '../server/domain/scenario.js';
import { optimizerSettings } from '../server/optimization/settings.js';
const data = await inputs(),
  seed = 20260924;
const random = rng(seed),
  office = { ...data.office, lat: 55.72, lng: 37.61, synthetic: true };
const districts = [...new Set(data.jobs.map((j) => j.district))].sort();
const anchors = {};
for (const district of districts) {
  let x, y;
  if (district.includes('Зеленоград')) {
    x = -30 + random() * 8;
    y = 30 + random() * 8;
  } else if (['Рогово', 'Вороново', 'Троицк', 'Московский', 'Коммунарка'].includes(district)) {
    x = -8 - random() * 20;
    y = -12 - random() * 40;
  } else {
    const angle = random() * 2 * Math.PI,
      radius = 3 + Math.sqrt(random()) * 19;
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius;
  }
  anchors[district] = { eastKm: x, northKm: y };
}
const jobs = data.jobs.map((j) => {
  const a = anchors[j.district],
    theta = random() * Math.PI * 2,
    radius = Math.sqrt(random()) * 1.5;
  return {
    ...j,
    lat: office.lat + (a.northKm + Math.sin(theta) * radius) / 111.32,
    lng:
      office.lng + (a.eastKm + Math.cos(theta) * radius) / (111.32 * Math.cos((office.lat * Math.PI) / 180)),
    createdAt: 0,
    geocode: {
      status: 'synthetic',
      precision: 'generated',
      seed,
      description: 'Generated clustered test point, not the actual address',
    },
  };
});
const roster = deriveEngineers(jobs, office, 'khutor');
const state = {
  ...createScenario({ count: 0, engineerCount: 0, seed }),
  jobs,
  engineers: roster.engineers,
  settings: {
    roadMode: 'estimate',
    stability: false,
    mode: 'economy',
    ...optimizerSettings({ balanceWork: true }),
  },
  dataset: {
    id: 'khutor',
    name: 'Хутор',
    date: data.date,
    office,
    source: data.file,
    roster: { method: roster.method, demand: roster.demand },
  },
};
const source = JSON.parse(await fs.readFile(new URL('source.json', root), 'utf8'));
const assumptions = {
  sourceSha256: source.sha256,
  seed,
  jobs: jobs.length,
  engineers: roster.engineers.length,
  geometry:
    'Synthetic points grouped by district label. District centres except coarse outer clusters are random, not real geography. All 500 supplied rows retained. No real geocoding.',
  office: 'Synthetic office 55.72,37.61; not a verified building',
  districtAnchors: anchors,
  transport:
    'All engineers may walk or take estimated public transit; same static travel model for both solvers',
  resources:
    'Single-skill engineers derived before optimisation with existing workload / 65% capacity rule; no stock or equipment requirements supplied, arrays empty for both solvers',
  history:
    'No previous work history supplied or fabricated; balance uses planned onsite work and shift lengths',
  gigabit:
    'Six rows have gigabit=yes; flag preserved but no separate normative duration or skill is inferred without a requirement',
  limits:
    'CLI experiment bypasses UI size limit of 100 jobs / 40 engineers; active dispatcher state unchanged',
};
await fs.writeFile(new URL('scenario.json', root), JSON.stringify(state, null, 2) + '\n');
await fs.writeFile(new URL('assumptions.json', root), JSON.stringify(assumptions, null, 2) + '\n');
console.log(
  JSON.stringify({
    jobs: jobs.length,
    engineers: roster.engineers.length,
    seed,
    districts: districts.length,
    types: jobs.reduce((a, j) => ((a[j.type] = (a[j.type] || 0) + 1), a), {}),
  }),
);

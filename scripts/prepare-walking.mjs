// Three bounded synthetic scenarios; one request at a time, cached, max one per 1.1 seconds.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { OFFICIAL_DATASETS } from '../server/infrastructure/datasets.js';
import { createOfficialScenario } from '../server/domain/official-scenario.js';
import { pointKey, hasCoordinates } from '../server/optimization/travel.js';
import { preparedUrl, readPreparedTravel, preparedMatrix } from '../server/infrastructure/prepared-travel.js';
import { solve } from '../server/optimization/solver.js';
const provider = process.env.WALKING_ROUTER_URL || 'https://routing.openstreetmap.de/routed-foot';
const cache = await readPreparedTravel();
cache.regions ||= {};
cache.geometries ||= {};
const stateArg = process.argv.indexOf('--state');
const current = stateArg >= 0 ? JSON.parse(await fs.readFile(process.argv[stateArg + 1], 'utf8')) : null;
if (current && !OFFICIAL_DATASETS.some((d) => d.id === current.dataset?.id))
  throw new Error('--state должен содержать сохранённый день из зарегистрированного набора');
let previous = 0;
async function request(path) {
  await setTimeout(Math.max(0, 1100 - (Date.now() - previous)));
  previous = Date.now();
  const r = await fetch(provider + path, {
    headers: { 'User-Agent': 'Kontur-LCT2026/3.0 (bounded synthetic demo preparation)' },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`Walking provider HTTP ${r.status}; stopped`);
  const data = await r.json();
  if (data.code !== 'Ok') throw new Error(data.message || data.code);
  return data;
}
const selected = process.env.DATASET_IDS?.split(',');
for (const id of current
  ? [current.dataset.id]
  : OFFICIAL_DATASETS.filter((d) => !selected || selected.includes(d.id)).map((d) => d.id)) {
  const state = current || (await createOfficialScenario(id));
  const original = await createOfficialScenario(id);
  const points = [
    ...new Map(
      [
        ...state.engineers.flatMap((e) => [e.home, e.position]),
        ...state.jobs,
        ...original.jobs,
        ...original.engineers.map((e) => e.home),
      ]
        .filter(hasCoordinates)
        .map((p) => [pointKey(p), p]),
    ).keys(),
  ].sort();
  const signature = createHash('sha256').update(JSON.stringify({ provider, points })).digest('hex');
  if (cache.regions[id]?.id !== signature) {
    const response = await request(`/table/v1/foot/${points.join(';')}?annotations=duration,distance`);
    cache.regions[id] = {
      id: signature,
      points,
      provider,
      profile: 'foot',
      quality: 'routed',
      generatedAt: new Date().toISOString(),
      durationSeconds: response.durations,
      distanceMeters: response.distances,
    };
    await fs.writeFile(preparedUrl, JSON.stringify(cache) + '\n');
  }
  console.log(`${id}: ${points.length} points, walking matrix ${signature.slice(0, 10)}`);
  if (!process.argv.includes('--geometry')) continue;
  const plan = solve(state, preparedMatrix(state, cache.regions[id]), { iterations: 60 });
  for (const route of plan.routes)
    for (const stop of route.stops.filter((s) => s.travelMode === 'foot' && !s.estimated && s.km > 0)) {
      const job = state.jobs.find((j) => j.id === stop.jobId),
        key = `${pointKey(stop.from)}|${pointKey(job)}`;
      if (cache.geometries[key]) continue;
      const response = await request(
        `/route/v1/foot/${pointKey(stop.from)};${pointKey(job)}?overview=full&geometries=geojson&steps=false`,
      );
      cache.geometries[key] = {
        coordinates: response.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        provider,
        generatedAt: new Date().toISOString(),
      };
      await fs.writeFile(preparedUrl, JSON.stringify(cache) + '\n');
      console.log(`${id}: walking segment cached`);
    }
}

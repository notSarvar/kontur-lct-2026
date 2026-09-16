// One-off preparation of this specific synthetic dataset, not an autocomplete API.
import fs from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { loadOfficialDatasets } from '../server/infrastructure/datasets.js';
import {
  normalizeAddress,
  structuredAddress,
  readGeocache,
  geocacheUrl,
} from '../server/infrastructure/geocoding.js';

const datasets = await loadOfficialDatasets();
const addresses = [
  ...new Set(
    datasets.flatMap((d) => [d.office.address, ...d.jobs.map((j) => j.address)]).map(normalizeAddress),
  ),
];
const cache = await readGeocache();
const provider = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
let requests = 0;
const refine = process.argv.includes('--refine');
const houseKey = (value) =>
  String(value)
    .toLowerCase()
    .replace(/корпус|корп\.?/g, 'к')
    .replace(/строение|стр\.?/g, 'с')
    .replace(/\s+/g, '')
    .replace(/a/g, 'а')
    .replace(/b/g, 'в');
for (const address of addresses) {
  if (
    cache[address]?.status === 'matched' ||
    (cache[address] && !refine) ||
    (refine && cache[address]?.refined)
  )
    continue;
  if (requests) await setTimeout(1100);
  const url = new URL(provider);
  const structured = structuredAddress(address),
    { house, ...query } = structured;
  Object.entries({
    ...(refine ? query : { q: address }),
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'ru',
    limit: '3',
    'accept-language': 'ru',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Kontur-LCT2026/2.0 (one-time synthetic Moscow dataset preparation)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Geocoder HTTP ${response.status}; stopped without retrying the service`);
  const results = await response.json();
  const matches = results.filter(
    (r) =>
      r.address?.house_number &&
      (!house || houseKey(r.address.house_number) === houseKey(house)) &&
      r.place_rank >= 28 &&
      +r.lat > 54 &&
      +r.lat < 57 &&
      +r.lon > 35 &&
      +r.lon < 40,
  );
  const clustered =
    matches.length &&
    matches.every(
      (r) => Math.abs(+r.lat - +matches[0].lat) < 0.001 && Math.abs(+r.lon - +matches[0].lon) < 0.0015,
    );
  const best = clustered ? matches.find((r) => r.osm_type === 'way') || matches[0] : null;
  cache[address] = best
    ? {
        status: 'matched',
        lat: +best.lat,
        lng: +best.lon,
        displayName: best.display_name,
        osmType: best.osm_type,
        osmId: best.osm_id,
        attribution: '© OpenStreetMap contributors, ODbL',
        provider,
        fetchedAt: new Date().toISOString(),
      }
    : {
        status: results.length ? 'review' : 'not_found',
        candidates: results.map((r) => ({ lat: +r.lat, lng: +r.lon, label: r.display_name })),
        provider,
      };
  cache[address].refined = refine;
  await fs.writeFile(geocacheUrl, JSON.stringify(cache, null, 2) + '\n');
  requests++;
  console.log(`${Object.keys(cache).length}/${addresses.length} ${cache[address].status}: ${address}`);
}
console.log(
  `Prepared ${addresses.length} unique addresses; ${Object.values(cache).filter((r) => r.status === 'matched').length} building matches. Others require manual confirmation.`,
);

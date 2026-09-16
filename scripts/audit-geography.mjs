// One-off investigation of unresolved synthetic addresses. Never auto-confirms a different building.
import fs from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { loadOfficialDatasets } from '../server/infrastructure/datasets.js';
import { readGeocache, normalizeAddress } from '../server/infrastructure/geocoding.js';
const aliases = {
  'east:98815': 'Москва 2-я улица Синичкина 9к1',
  'east:17892': 'Москва 11-я улица Текстильщиков 10',
  'east:48227': 'Москва Таганский район улица Талалихина 16',
  'east:47330': 'Москва Красноказарменная улица 9Б строение 1',
  'southeast:67472': 'Домодедово 1-й Советский проезд 1А',
  'southeast:23807': 'Москва Загорьевский проезд 9',
  'southeast:23094': 'Кашира улица 8 Марта 22',
  'southeast:79144': 'Москва Ореховый бульвар 7к1',
  'southeast:90989': 'Домодедово улица Гагарина 55/2',
  'southeast:33507': 'Москва Бирюлёвская улица 58к3',
  'southeast:7258': 'Домодедово Востряково улица Жуковского 14/18',
  'southeast:98998': 'Кашира улица Кржижановского 5/1',
  'southeast:51774': 'Кашира улица Кржижановского 5/3',
  'southeast:90915': 'Кашира улица Кржижановского 5/2',
  'southeast:1287': 'Москва Бирюлёвская улица 44',
  'southcenter:66376': 'Москва Дубининская улица 59к2',
  'southcenter:86002': 'Москва Даниловский район Городская улица 9',
  'southcenter:18023': 'Москва Ленинский проспект 70/11',
};
const file = new URL('../data/beeline/geography-review.json', import.meta.url);
let audit = {};
try {
  audit = JSON.parse(await fs.readFile(file, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const cache = await readGeocache();
let requests = 0;
for (const dataset of await loadOfficialDatasets())
  for (const job of dataset.jobs) {
    const key = normalizeAddress(job.address);
    if (cache[key]?.status === 'matched' || audit[key]) continue;
    if (requests) await setTimeout(1100);
    const url = new URL('https://nominatim.openstreetmap.org/search');
    const query = aliases[job.id] || key;
    for (const [k, v] of Object.entries({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '20',
      dedupe: '0',
      countrycodes: 'ru',
      'accept-language': 'ru',
    }))
      url.searchParams.set(k, v);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Kontur-LCT2026/3.0 (one-off synthetic address review)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Geocoder HTTP ${response.status}`);
    const results = await response.json();
    audit[key] = { query, source: url.toString(), fetchedAt: new Date().toISOString(), results };
    await fs.writeFile(file, JSON.stringify(audit, null, 2) + '\n');
    console.log(
      job.id,
      query,
      JSON.stringify(
        results.map((r) => ({
          lat: r.lat,
          lng: r.lon,
          house: r.address?.house_number,
          street: r.address?.road,
          type: r.addresstype,
          osm: r.osm_type + ':' + r.osm_id,
          rank: r.place_rank,
          district: r.address?.suburb,
        })),
      ),
    );
    requests++;
  }

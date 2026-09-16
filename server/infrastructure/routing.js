import { pointKey, hasCoordinates } from '../optimization/travel.js';
const matrixCache = new Map(),
  routeCache = new Map();
const BASE = process.env.OSRM_URL || 'https://router.project-osrm.org';
let unavailableUntil = 0;
async function request(path) {
  if (Date.now() < unavailableUntil) throw new Error('Сервис временно недоступен');
  try {
    const response = await fetch(BASE + path, {
      signal: AbortSignal.timeout(4500),
      headers: { 'User-Agent': 'LCT-Route-Lab/1.0 (local prototype)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.code !== 'Ok') throw new Error('Нет дорожного маршрута');
    return data;
  } catch (error) {
    unavailableUntil = Date.now() + 60000;
    throw error;
  }
}
export async function getTravel(state) {
  if (state.settings.roadMode !== 'osrm' || !state.engineers.some((e) => e.transport === 'car'))
    return {
      matrix: {},
      source: 'estimate',
      detail:
        'Пешком: 4,8 км/ч, коэффициент пути 1,25. Общественный транспорт: 23 км/ч, коэффициент 1,35, 12 минут на подход и ожидание; выбирается более быстрый вариант. Оценка без реальных линий, расписаний и пробок; километраж тоже оценочный.',
    };
  const points = [
    ...new Map(
      [...state.engineers.map((e) => e.position), ...state.jobs.filter((j) => j.status === 'pending')]
        .filter(hasCoordinates)
        .map((p) => [pointKey(p), p]),
    ).values(),
  ];
  if (points.length < 2)
    return { matrix: {}, source: 'estimate', detail: 'Недостаточно точек для дорожной матрицы.' };
  const key = points.map(pointKey).join(';');
  if (matrixCache.has(key)) return matrixCache.get(key);
  try {
    const data = await request(`/table/v1/driving/${key}?annotations=duration,distance`);
    const matrix = {};
    points.forEach((a, i) =>
      points.forEach((b, j) => {
        const d = data.durations[i][j],
          km = data.distances[i][j];
        matrix[`${pointKey(a)}|${pointKey(b)}`] =
          d === null || km === null ? null : { minutes: Math.ceil(d / 60), km: km / 1000, estimated: false };
      }),
    );
    const mixed = state.engineers.some((e) => e.transport !== 'car');
    const result = {
      matrix,
      source: mixed ? 'mixed' : 'osrm',
      detail: mixed
        ? 'Авто: дорожная сеть OSRM. Пешком / велосипед: оценка по координатам. Без пробок.'
        : 'Дорожная сеть OSRM, время без текущих пробок.',
    };
    matrixCache.set(key, result);
    if (matrixCache.size > 30) matrixCache.delete(matrixCache.keys().next().value);
    return result;
  } catch {
    return {
      matrix: {},
      source: 'fallback',
      detail: 'OSRM недоступен. Используется оценка по координатам и скорости, без дорожной сети и пробок.',
    };
  }
}
export async function addGeometries(state) {
  const byId = Object.fromEntries(state.jobs.map((j) => [j.id, j]));
  for (const route of state.plan.routes) {
    const engineer = state.engineers.find((e) => e.id === route.engineerId);
    const points = [engineer.position, ...route.stops.map((s) => byId[s.jobId])].filter(hasCoordinates);
    route.geometry = points.map((p) => [p.lat, p.lng]);
    route.roadGeometry = false;
    if (
      engineer.transport !== 'car' ||
      !['osrm', 'mixed'].includes(state.plan.roadSource) ||
      points.length < 2
    )
      continue;
    const key = points.map(pointKey).join(';');
    try {
      let coordinates = routeCache.get(key);
      if (!coordinates) {
        const data = await request(`/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`);
        coordinates = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        routeCache.set(key, coordinates);
        if (routeCache.size > 100) routeCache.delete(routeCache.keys().next().value);
      }
      route.geometry = coordinates;
      route.roadGeometry = true;
    } catch {
      /* Straight segments remain explicitly marked in the UI. */
    }
  }
}

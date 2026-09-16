import fs from 'node:fs/promises';
import { pointKey, hasCoordinates, haversine } from '../optimization/travel.js';
import { contextFor } from '../optimization/evaluate.js';
export const preparedUrl = new URL('../../data/beeline/walking-matrices.json', import.meta.url);
export async function readPreparedTravel() {
  try {
    return JSON.parse(await fs.readFile(preparedUrl, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { regions: {}, geometries: {} };
    throw error;
  }
}
export function preparedMatrix(state, bundle) {
  const matrix = {},
    available = new Set(bundle.points);
  const points = [
    ...new Map(
      [
        ...state.engineers.map((e) => contextFor(state, e).origin),
        ...state.jobs.filter((j) => ['pending', 'enroute', 'working'].includes(j.status)),
      ]
        .filter(hasCoordinates)
        .map((p) => [pointKey(p), p]),
    ).values(),
  ];
  const missing = points.filter((p) => !available.has(pointKey(p)));
  if (missing.length)
    throw Object.assign(
      new Error(
        `В подготовленной пешей матрице нет ${missing.length} точек. Подготовьте матрицу заново или явно выберите оценочный режим.`,
      ),
      { status: 409, code: 'DATA_NOT_READY' },
    );
  if (state.engineers.some((e) => !['foot', 'transit'].includes(e.transport)))
    throw Object.assign(
      new Error(
        'Подготовленная матрица поддерживает ходьбу и общественный транспорт. Выберите подходящий режим поездок.',
      ),
      { status: 400 },
    );
  const index = new Map(bundle.points.map((key, i) => [key, i]));
  for (const a of points)
    for (const b of points) {
      const key = `${pointKey(a)}|${pointKey(b)}`,
        i = index.get(pointKey(a)),
        j = index.get(pointKey(b));
      const seconds = bundle.durationSeconds[i][j],
        meters = bundle.distanceMeters[i][j];
      const foot =
        seconds === null || meters === null
          ? null
          : {
              minutes: Math.ceil(seconds / 60),
              km: meters / 1000,
              estimated: false,
              mode: 'foot',
              provider: bundle.provider,
            };
      matrix[`foot:${key}`] = foot;
      const direct = haversine(a, b),
        estimate = {
          minutes: Math.ceil(12 + ((direct * 1.35) / 23) * 60),
          km: direct * 1.35,
          estimated: true,
          mode: 'transit',
        };
      matrix[`transit:${key}`] = foot && foot.minutes <= estimate.minutes ? foot : estimate;
    }
  return matrix;
}

import { assert } from '../domain/validation.js';
export function optimizerSettings(input = {}) {
  const settings = {
    solver: input.solver ?? 'alns',
    alnsIterations: input.alnsIterations ?? 60,
    alnsRestarts: input.alnsRestarts ?? 1,
    ortoolsSeconds: input.ortoolsSeconds ?? 10,
    balanceWork: input.balanceWork ?? true,
  };
  assert(['alns', 'ortools'].includes(settings.solver), 'Неизвестный алгоритм');
  assert(
    Number.isInteger(settings.alnsIterations) &&
      settings.alnsIterations >= 0 &&
      settings.alnsIterations <= 1000,
    'Число итераций: 0–1000',
  );
  assert(
    Number.isInteger(settings.alnsRestarts) && settings.alnsRestarts >= 1 && settings.alnsRestarts <= 5,
    'Число запусков: 1–5',
  );
  assert(
    Number.isInteger(settings.ortoolsSeconds) &&
      settings.ortoolsSeconds >= 1 &&
      settings.ortoolsSeconds <= 60,
    'Бюджет OR-Tools: 1–60 секунд',
  );
  assert(typeof settings.balanceWork === 'boolean', 'Проверьте настройку баланса нагрузки');
  return settings;
}

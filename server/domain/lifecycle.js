import { assert } from './validation.js';
import { addEvent } from './scenario.js';
const finite = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
export function advance(state, to) {
  assert(
    finite(to, state.time, 1440),
    'Время можно двигать только вперёд, до 24:00. Для повтора создайте новый сценарий.',
  );
  const original = state.time;
  for (let minute = original; minute <= Math.floor(to); minute++) {
    state.time = minute;
    for (const route of state.plan?.routes || []) {
      const engineer = state.engineers.find((e) => e.id === route.engineerId);
      for (const stop of route.stops) {
        const job = state.jobs.find((j) => j.id === stop.jobId);
        if (!job || ['done', 'blocked', 'manual_review'].includes(job.status)) continue;
        if (job.status === 'pending' && minute >= stop.depart) {
          job.status = 'enroute';
          job.lockedStop = structuredClone(stop);
          addEvent(state, 'Инженер в пути', `№${job.number} · ${job.address}`, engineer.id);
        }
        if (job.status === 'enroute' && minute >= stop.start) {
          job.status = 'working';
          job.actualStart = stop.start;
          engineer.position = { lat: job.lat, lng: job.lng };
          addEvent(state, 'Работа начата', `№${job.number}`, engineer.id);
        }
        if (job.status === 'working' && minute >= stop.end) {
          job.status = 'done';
          job.actualEnd = stop.end;
          engineer.position = { lat: job.lat, lng: job.lng };
          addEvent(state, 'Заявка выполнена', `№${job.number}`, engineer.id, 'success');
        }
        if (job.status === 'enroute') {
          const f = Math.min(
            1,
            Math.max(0, (minute - stop.depart) / Math.max(1, stop.arrival - stop.depart)),
          );
          engineer.position = {
            lat: stop.from.lat + (job.lat - stop.from.lat) * f,
            lng: stop.from.lng + (job.lng - stop.from.lng) * f,
          };
        }
        if (['enroute', 'working'].includes(job.status)) break;
      }
    }
  }
  state.time = Math.floor(to);
}

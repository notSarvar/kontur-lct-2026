import { SKILLS, EQUIPMENT, TYPES } from './catalog.js';
export function assert(condition, message) {
  if (!condition) {
    const e = new Error(message);
    e.status = 400;
    throw e;
  }
}
const finite = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
export function validateJob(j, { allowUnresolved = false } = {}) {
  assert(j && typeof j === 'object', 'Некорректная заявка');
  assert(
    typeof j.title === 'string' && j.title.trim().length > 0 && j.title.length < 180,
    'Укажите название заявки',
  );
  assert(
    typeof j.address === 'string' && j.address.trim().length > 0 && j.address.length < 300,
    'Укажите адрес / название точки',
  );
  assert(
    (allowUnresolved && j.lat === null && j.lng === null) ||
      (finite(j.lat, -85, 85) && finite(j.lng, -180, 180)),
    'Координаты должны быть числами в допустимом диапазоне',
  );
  assert(
    finite(j.windowStart, 0, 1439) && finite(j.windowEnd, j.windowStart, 1439),
    'Проверьте временное окно',
  );
  assert(finite(j.duration, 5, 480), 'Длительность работы: от 5 до 480 минут');
  assert(
    Array.isArray(j.skills) && j.skills.length === 1 && j.skills.every((k) => k in SKILLS),
    'У заявки должен быть один известный навык',
  );
  assert(Array.isArray(j.equipment) && j.equipment.every((k) => k in EQUIPMENT), 'Неизвестное оборудование');
  assert(['normal', 'urgent'].includes(j.priority), 'Неизвестный приоритет');
  assert(['any', 'car', 'bike', 'foot', 'transit'].includes(j.requiredTransport), 'Неизвестный транспорт');
  return {
    title: j.title.trim(),
    address: j.address.trim(),
    lat: j.lat,
    lng: j.lng,
    type: j.type in TYPES ? j.type : 'local',
    windowStart: j.windowStart,
    windowEnd: j.windowEnd,
    duration: j.duration,
    skills: [...new Set(j.skills)],
    equipment: [...new Set(j.equipment)],
    priority: j.priority,
    requiredTransport: j.requiredTransport,
    contact: String(j.contact || '').slice(0, 300),
  };
}
export function validateEngineer(e) {
  assert(typeof e.name === 'string' && e.name.trim() && e.name.length < 80, 'Укажите имя инженера');
  assert(
    Array.isArray(e.skills) && e.skills.length > 0 && e.skills.every((k) => k in SKILLS),
    'Выберите квалификации',
  );
  assert(Array.isArray(e.equipment) && e.equipment.every((k) => k in EQUIPMENT), 'Проверьте оборудование');
  assert(e.skills.length <= Object.keys(SKILLS).length, 'Проверьте набор навыков инженера');
  assert(['car', 'bike', 'foot', 'transit', 'none'].includes(e.transport), 'Проверьте транспорт');
  assert(
    finite(e.shiftStart, 0, 1439) && finite(e.shiftEnd, e.shiftStart + 1, 1440),
    'Проверьте время смены',
  );
  const p = e.home || e.position;
  assert(p && finite(p.lat, -85, 85) && finite(p.lng, -180, 180), 'Проверьте координаты базы');
  const history = e.workHistory || { workMinutes: 0, availableMinutes: 0, label: '' };
  assert(
    finite(history.availableMinutes, 0, 100000) && finite(history.workMinutes, 0, history.availableMinutes),
    'История: работа должна быть от 0 до доступного времени прошлых смен (не более 100 000 мин)',
  );
  assert(
    typeof history.label === 'string' && history.label.length <= 150,
    'Укажите период истории (до 150 символов)',
  );
  return {
    name: e.name.trim(),
    skills: [...new Set(e.skills)],
    equipment: [...new Set(e.equipment)],
    transport: e.transport,
    shiftStart: e.shiftStart,
    shiftEnd: e.shiftEnd,
    home: { lat: p.lat, lng: p.lng },
    workHistory: {
      workMinutes: history.workMinutes,
      availableMinutes: history.availableMinutes,
      label: history.label.trim(),
    },
  };
}

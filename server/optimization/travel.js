export function hasCoordinates(p) {
  return (
    typeof p?.lat === 'number' &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 85 &&
    typeof p?.lng === 'number' &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lng) <= 180
  );
}
export function haversine(a, b) {
  if (!hasCoordinates(a) || !hasCoordinates(b)) return Infinity;
  const rad = (x) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export const pointKey = (p) => (hasCoordinates(p) ? `${p.lng.toFixed(6)},${p.lat.toFixed(6)}` : 'unresolved');

export function estimatedLeg(a, b, transport = 'transit') {
  const direct = haversine(a, b);
  if (!Number.isFinite(direct)) return { minutes: Infinity, km: Infinity, mode: transport, estimated: true };
  if (direct < 0.03) return { minutes: 0, km: 0, mode: 'foot', estimated: true };
  const walking = {
    minutes: Math.ceil(((direct * 1.25) / 4.8) * 60),
    km: direct * 1.25,
    mode: 'foot',
    estimated: true,
  };
  if (transport === 'foot') return walking;
  if (transport === 'transit') {
    // Explicit approximation: access + wait = 12 min, effective transit speed 23 km/h.
    // No timetable, real line selection or claim of actual road geometry.
    const transit = {
      minutes: Math.ceil(12 + ((direct * 1.35) / 23) * 60),
      km: direct * 1.35,
      mode: 'transit',
      estimated: true,
    };
    return walking.minutes <= transit.minutes ? walking : transit;
  }
  return {
    minutes: Math.ceil(
      ((direct * 1.35) / (transport === 'bike' ? 14 : 24)) * 60 + (transport === 'car' ? 3 : 1),
    ),
    km: direct * 1.35,
    mode: transport,
    estimated: true,
  };
}
export const estimatedTravel = (a, b, transport) => estimatedLeg(a, b, transport).minutes;

export function legFunction(matrix = {}) {
  const cache = new Map();
  return (a, b, engineer) => {
    const key = `${pointKey(a)}|${pointKey(b)}`,
      modeKey = `${engineer.transport}:${key}`;
    if (cache.has(modeKey)) return cache.get(modeKey);
    const value = matrix[modeKey] ?? (engineer.transport === 'car' ? matrix[key] : undefined);
    // Do not confuse explicitly unreachable entries with absent estimates.
    const raw = Object.hasOwn(matrix, modeKey) ? matrix[modeKey] : value;
    let leg = estimatedLeg(a, b, engineer.transport);
    if (raw === null) leg = { ...leg, minutes: Infinity, km: Infinity };
    else if (typeof raw === 'number') leg = { ...leg, minutes: raw };
    else if (raw && typeof raw === 'object')
      leg = { ...raw, estimated: raw.estimated ?? false, mode: engineer.transport };
    cache.set(modeKey, leg);
    return leg;
  };
}
export function travelFunction(matrix = {}) {
  const leg = legFunction(matrix);
  return (a, b, e) => leg(a, b, e).minutes;
}

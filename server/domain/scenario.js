import { SKILLS, TYPES, COLORS, DEPOT } from './catalog.js';
import { LOCATIONS } from './locations.js';
import { OFFICIAL_POLICY } from './official-policy.js';
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function createScenario({ seed = 42, count = 18, engineerCount = 4, includeUrgent = false } = {}) {
  const random = rng(seed);
  const combinations = [
    ['local', 'connection', 'additional'],
    ['emergency', 'local'],
    ['connection', 'additional', 'emergency'],
    Object.keys(SKILLS),
  ];
  const engineers = Array.from({ length: engineerCount }, (_, i) => ({
    id: `eng-${i + 1}`,
    name: `Инженер ${String(i + 1).padStart(2, '0')}`,
    color: COLORS[i % COLORS.length],
    skills: combinations[i % combinations.length],
    equipment: [],
    transport: 'transit',
    synthetic: true,
    shiftStart: 480,
    shiftEnd: 1380,
    position: { ...DEPOT },
    home: { ...DEPOT },
    pausedUntil: 0,
  }));
  const keys = Object.keys(TYPES).filter((type) => includeUrgent || type !== 'emergency');
  const jobs = Array.from({ length: count }, (_, i) => {
    const type = keys[Math.floor(random() * keys.length)],
      loc = LOCATIONS[Math.floor(random() * LOCATIONS.length)];
    const start = 540 + Math.floor(random() * 7) * 45,
      windowEnd = Math.min(1260, start + 180 + Math.floor(random() * 3) * 30);
    return {
      id: `job-${i + 1}`,
      number: 1001 + i,
      inputOrder: i,
      title: TYPES[type].name,
      type,
      address: loc[0],
      lat: loc[1],
      lng: loc[2],
      contact: 'Учебный сценарий',
      windowStart: start,
      windowEnd,
      duration: TYPES[type].duration,
      skills: [TYPES[type].skill],
      equipment: [],
      requiredTransport: 'any',
      priority: type === 'emergency' ? 'urgent' : 'normal',
      status: 'pending',
      createdAt: 480,
      notes: [],
      engineerId: null,
      actualStart: null,
      actualEnd: null,
    };
  });
  return {
    version: 2,
    catalogVersion: OFFICIAL_POLICY.version,
    revision: 0,
    seed,
    time: 480,
    engineers,
    jobs,
    plan: null,
    settings: { roadMode: 'estimate', stability: true, mode: 'economy' },
    notifications: [],
    support: [],
    createdAt: new Date().toISOString(),
    nextNumber: 1001 + count,
    history: [],
  };
}
export function addEvent(state, title, detail = '', engineerId = null, kind = 'info') {
  state.notifications.unshift({ id: crypto.randomUUID(), time: state.time, title, detail, engineerId, kind });
  state.notifications = state.notifications.slice(0, 100);
}

import fs from 'node:fs/promises';
import { OFFICIAL_POLICY } from '../domain/official-policy.js';

const dataRoot = new URL('../../data/beeline/', import.meta.url);
export const OFFICIAL_DATASETS = [
  { id: 'east', name: 'Восток', file: 'Восток Синтетические данные.csv', count: 66, date: '2026-08-17' },
  {
    id: 'southeast',
    name: 'Юго-восток',
    file: 'Юго-восток Синтетические данные.csv',
    count: 83,
    date: '2026-08-17',
  },
  {
    id: 'southcenter',
    name: 'Югоцентр',
    file: 'Югоцентр Синтетические данные.csv',
    count: 56,
    date: '2026-08-17',
  },
  {
    id: 'east-day2',
    name: 'Восток · день 2',
    file: 'additional/восток день 2.csv',
    baseRegion: 'east',
    count: 74,
    date: '2026-09-28',
    format: 'additional-day',
  },
  {
    id: 'east-day3',
    name: 'Восток · день 3',
    file: 'additional/восток день 3.csv',
    baseRegion: 'east',
    count: 78,
    date: '2026-09-29',
    format: 'additional-day',
  },
  {
    id: 'southeast-day2',
    name: 'Юго-восток · день 2',
    file: 'additional/юго-восток день 2.csv',
    baseRegion: 'southeast',
    count: 87,
    date: '2026-09-29',
    format: 'additional-day',
  },
  {
    id: 'southeast-day3',
    name: 'Юго-восток · день 3',
    file: 'additional/юго восок день 3.csv',
    baseRegion: 'southeast',
    count: 102,
    date: '2026-09-28',
    format: 'additional-day',
  },
  {
    id: 'southcenter-day2',
    name: 'Югоцентр · день 2',
    file: 'additional/юго-центр день 2.csv',
    baseRegion: 'southcenter',
    count: 77,
    date: '2026-09-28',
    format: 'additional-day',
  },
  {
    id: 'southcenter-day3',
    name: 'Югоцентр · день 3',
    file: 'additional/юго-центр день 3.csv',
    baseRegion: 'southcenter',
    count: 79,
    date: '2026-09-28',
    format: 'additional-day',
  },
];
const workTypes = {
  Подключение: { type: 'connection', skill: 'connection', norm: 'Подключение клиентов Базовая' },
  Дозаказ: { type: 'additional', skill: 'additional', norm: 'Дозаказ оборудования' },
  'Локальная заявка': { type: 'local', skill: 'local', norm: 'Локальная заявка/ремонт у клиента' },
};

export function officialWork(fields, norms, policy = OFFICIAL_POLICY) {
  const bk = fields['Тип заявки BK'],
    hd = fields['Тип заявки HD'];
  let work = workTypes[bk];
  if (bk === 'Глобальная проблема') {
    if (hd === 'Информация')
      return {
        type: 'information',
        skills: [policy.globalSkill],
        priority: 'normal',
        duration: policy.informationServiceMinutes,
        normRow: null,
        assumptions: [policy.globalSkillAssumption, policy.informationDurationAssumption],
        priorityBasis: 'HD = Информация: обычный приоритет; исходное окно сохраняется',
      };
    if (hd !== 'Авария') throw new Error(`Неизвестный HD глобальной проблемы: ${hd}`);
    work = { type: 'emergency', skill: policy.globalSkill, norm: 'Аварий на ТКД' };
  }
  if (!work) throw new Error(`Неизвестный тип работ: ${bk}`);
  const norm = norms.rows.find((n) => n.name === work.norm);
  if (!norm || norm.travelMinutes + norm.technicalMinutes + norm.documentsMinutes !== norm.totalMinutes)
    throw new Error(`Не найден или некорректен норматив: ${work.norm}`);
  return {
    type: work.type,
    skills: [work.skill],
    priority: work.type === 'emergency' ? 'urgent' : 'normal',
    duration: norm.technicalMinutes + norm.documentsMinutes,
    normRow: norm.sourceRow,
    assumptions: bk === 'Глобальная проблема' ? [policy.globalSkillAssumption] : [],
    priorityBasis:
      work.type === 'emergency'
        ? 'HD = Авария: срочно независимо от ширины окна'
        : 'Обычный приоритет; ширина окна сама по себе не означает аварию',
  };
}

// Preserve quoted delimiters and newlines, which occur in exported address fields.
export function parseCsv(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, '');
  const pushField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const pushRow = () => {
    pushField();
    if (row.some((s) => s.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === ';') pushField();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (c === '"' || closed) throw new Error('Некорректные кавычки в CSV');
      field += c;
    }
  }
  if (quoted) throw new Error('Незакрытая кавычка в CSV');
  if (field || row.length || closed) pushRow();
  return rows;
}

function parseDate(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Неизвестный формат даты: ${value}`);
  const [, day, month, year, hour, minute] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    hour > 23 ||
    minute > 59 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Некорректная дата: ${value}`);
  }
  return { date: date.toISOString().slice(0, 10), minutes: hour * 60 + minute };
}

export function normalizeOfficialCsv(text, dataset, norms) {
  const [header, ...rows] = parseCsv(text);
  const required = ['Заявка', 'Тип заявки BK', 'Тип заявки HD', 'Начало', 'Окончание', 'Район', 'Адрес'];
  if (!header || required.some((k) => !header.includes(k)))
    throw new Error('Отсутствуют обязательные столбцы синтетического CSV');
  if (header.includes('Бригада') || header.includes('Статус BK'))
    throw new Error('Контрольное распределение не используется');
  const jobs = [],
    ids = new Set();
  let office = null;
  for (const row of rows) {
    if (row.length !== header.length)
      throw new Error(`Количество полей не совпадает с заголовком: ${row[0]}`);
    if (row[0].trim().toLowerCase() === 'адрес офиса') {
      if (office || !row[1].trim()) throw new Error('Некорректная строка адреса офиса');
      office = { address: row[1].trim(), lat: null, lng: null };
      continue;
    }
    const source = Object.fromEntries(header.map((key, i) => [key, row[i].trim()]));
    const id = source['Заявка'];
    if (!/^\d+$/.test(id) || ids.has(id)) throw new Error(`Некорректный или повторный ID заявки: ${id}`);
    ids.add(id);
    const start = parseDate(source['Начало']),
      end = parseDate(source['Окончание']);
    if (start.date !== end.date || end.minutes < start.minutes)
      throw new Error(`Некорректное окно заявки ${id}`);
    if (!source['Адрес']) throw new Error(`Отсутствует адрес заявки ${id}`);
    const work = officialWork(source, norms);
    jobs.push({
      id: `${dataset.id}:${id}`,
      number: id,
      inputOrder: jobs.length,
      date: start.date,
      title: source['Тип заявки HD'],
      type: work.type,
      address: source['Адрес'],
      district: source['Район'],
      lat: null,
      lng: null,
      windowStart: start.minutes,
      windowEnd: end.minutes,
      duration: work.duration,
      skills: work.skills,
      equipment: [],
      requiredTransport: 'any',
      priority: work.priority,
      status: 'pending',
      engineerId: null,
      notes: [],
      actualStart: null,
      actualEnd: null,
      source: {
        file: dataset.file,
        fields: source,
        normRow: work.normRow,
        policyVersion: OFFICIAL_POLICY.version,
        assumptions: work.assumptions,
        priorityBasis: work.priorityBasis,
      },
      review: [],
    });
  }
  if (!office || !jobs.length || new Set(jobs.map((j) => j.date)).size !== 1)
    throw new Error('Ожидается один день заявок и адрес офиса');
  return {
    ...dataset,
    date: jobs[0].date,
    timezone: 'Europe/Moscow',
    office,
    jobs,
    engineers: null,
    readiness: {
      requiresGeocoding: jobs.length + 1,
      requiresEngineerRoster: true,
      requiresReview: jobs.filter((j) => j.review.length).map((j) => j.id),
    },
  };
}

// Explicit adapter for registered extra days. Original status remains source metadata;
// it is never interpreted as an assignment or completed visit in a new simulation.
export function normalizeAdditionalCsv(text, dataset, norms, office) {
  const [header, ...rows] = parseCsv(text);
  if (!header?.includes('Статус BK') || header.includes('Бригада'))
    throw new Error('Некорректный формат дополнительного дня');
  if (rows.some((r) => r.length !== header.length))
    throw new Error('Количество полей не совпадает с заголовком');
  const fields = rows.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i].trim()])));
  const columns = header.map((key, i) => (key === 'Статус BK' ? -1 : i)).filter((i) => i >= 0);
  const adapted = [
    columns.map((i) => header[i]),
    ['Адрес офиса', office.address, ...Array(columns.length - 2).fill('')],
    ...rows.map((row) => columns.map((i) => row[i])),
  ];
  const csv = adapted
    .map((row) => row.map((value) => '"' + value.replaceAll('"', '""') + '"').join(';'))
    .join('\n');
  const normalized = normalizeOfficialCsv(csv, dataset, norms);
  if (normalized.jobs.length !== dataset.count || normalized.date !== dataset.date)
    throw new Error('Количество заявок или дата не совпадают с описанием набора');
  for (let i = 0; i < normalized.jobs.length; i++) {
    normalized.jobs[i].source.fields = fields[i];
    normalized.jobs[i].source.importPolicy = 'independent-replay-v1';
    normalized.jobs[i].source.officeFromRegion = dataset.baseRegion;
  }
  return normalized;
}

export async function loadOfficialDatasets() {
  const norms = JSON.parse(await fs.readFile(new URL('norms.json', dataRoot), 'utf8'));
  const texts = await Promise.all(
    OFFICIAL_DATASETS.map(async (dataset) =>
      new TextDecoder('windows-1251', { fatal: true }).decode(
        await fs.readFile(new URL(dataset.file, dataRoot)),
      ),
    ),
  );
  const base = new Map();
  OFFICIAL_DATASETS.forEach((dataset, i) => {
    if (!dataset.baseRegion) base.set(dataset.id, normalizeOfficialCsv(texts[i], dataset, norms));
  });
  return OFFICIAL_DATASETS.map((dataset, i) =>
    dataset.baseRegion
      ? normalizeAdditionalCsv(texts[i], dataset, norms, base.get(dataset.baseRegion).office)
      : base.get(dataset.id),
  );
}

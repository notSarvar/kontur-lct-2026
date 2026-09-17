import fs from 'node:fs/promises';
import { OFFICIAL_POLICY } from '../domain/official-policy.js';

const dataRoot = new URL('../../data/beeline/', import.meta.url);
export const OFFICIAL_DATASETS = [
  { id: 'east', name: 'Восток', file: 'Восток Синтетические данные.csv' },
  { id: 'southeast', name: 'Юго-восток', file: 'Юго-восток Синтетические данные.csv' },
  { id: 'southcenter', name: 'Югоцентр', file: 'Югоцентр Синтетические данные.csv' },
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

export async function loadOfficialDatasets() {
  const norms = JSON.parse(await fs.readFile(new URL('norms.json', dataRoot), 'utf8'));
  return Promise.all(
    OFFICIAL_DATASETS.map(async (dataset) => {
      const bytes = await fs.readFile(new URL(dataset.file, dataRoot));
      return normalizeOfficialCsv(
        new TextDecoder('windows-1251', { fatal: true }).decode(bytes),
        dataset,
        norms,
      );
    }),
  );
}

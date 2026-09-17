import { OFFICIAL_POLICY } from './official-policy.js';
export const SKILLS = {
  local: 'Локальные работы',
  connection: 'Подключение',
  additional: 'Дозаказ',
  emergency: 'Аварийные работы (синтетический навык)',
};
export const EQUIPMENT = { tester: 'Тестер', router: 'Роутер', tools: 'Инструменты' };
export const TYPES = {
  local: { name: 'Локальная заявка / ремонт', skill: 'local', equipment: [], duration: 30 },
  connection: { name: 'Подключение клиента', skill: 'connection', equipment: [], duration: 70 },
  additional: { name: 'Дозаказ оборудования', skill: 'additional', equipment: [], duration: 20 },
  emergency: { name: 'Авария на ТКД', skill: OFFICIAL_POLICY.globalSkill, equipment: [], duration: 80 },
  information: {
    name: 'Информация о глобальной проблеме',
    skill: OFFICIAL_POLICY.globalSkill,
    equipment: [],
    duration: OFFICIAL_POLICY.informationServiceMinutes,
    durationAssumption: OFFICIAL_POLICY.informationDurationAssumption,
  },
};
export const COLORS = [
  '#237d68',
  '#6c65b3',
  '#c58439',
  '#487bac',
  '#ba6275',
  '#668341',
  '#b96437',
  '#427b85',
  '#8d699a',
  '#7e793e',
];
export const DEPOT = { lat: 55.7583, lng: 37.6106, address: 'Учебная база · Большая Дмитровка' };

export const time = (n) =>
  n == null
    ? '—'
    : `${Math.floor(n / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(n % 60)
        .toString()
        .padStart(2, '0')}`;
export const minutes = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};
export const duration = (n) =>
  n >= 60 ? `${Math.floor(n / 60)} ч ${Math.round(n % 60)} мин` : `${Math.round(n)} мин`;
export const initials = (n) =>
  /^Инженер \d+$/.test(n)
    ? n.split(' ')[1]
    : n
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('');
export const transport = {
  car: 'Автомобиль',
  bike: 'Велосипед',
  foot: 'Пешком',
  transit: 'Пешком и общественным транспортом',
  none: 'Недоступен',
  any: 'Любой',
};
export const statusText = {
  pending: 'Запланирована',
  enroute: 'В пути',
  working: 'На объекте',
  done: 'Выполнена',
  blocked: 'Нужна помощь',
  manual_review: 'Требует согласования',
};

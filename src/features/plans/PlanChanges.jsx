import React from 'react';
import { time } from '../../shared/format.js';
import { statusText } from '../../shared/format.js';
const labels = {
  added: 'Новая',
  removed: 'Удалена',
  assigned: 'Назначена',
  unassigned: 'На согласование',
  reassigned: 'Другой инженер',
  reordered: 'Порядок',
  retimed: 'Время',
  lock: 'Закрепление',
  updated: 'Параметры',
  status: 'Статус',
};
export default function PlanChanges({ diff, engineers = [] }) {
  if (!diff) return <p className="muted">Для сравнения сначала измените план.</p>;
  const engineerName = (id) => engineers.find((e) => e.id === id)?.name || id || 'Не назначена';
  const stop = (value) =>
    !value
      ? '—'
      : value.engineerId
        ? `${engineerName(value.engineerId)} · №${value.index + 1} · ${time(value.start)}–${time(value.end)}`
        : value.status === 'done'
          ? 'Выполнена'
          : 'Не назначена';
  const details = (c, side) => {
    const v = c[side];
    if (!v) return null;
    return (
      <>
        {c.kinds.includes('status') && <small>{statusText[v.status] || v.status}</small>}
        {c.kinds.includes('lock') && (
          <small>Закрепление: {v.pinnedEngineerId ? engineerName(v.pinnedEngineerId) : 'нет'}</small>
        )}
        {c.kinds.includes('updated') && (
          <small>
            {v.address}
            <br />
            {Number.isFinite(v.lat) ? `${v.lat}, ${v.lng}` : 'Точка не подтверждена'}
            <br />
            Окно {time(v.windowStart)}–{time(v.windowEnd)} · {v.duration} мин ·{' '}
            {v.priority === 'urgent' ? 'срочная' : 'обычная'}
          </small>
        )}
      </>
    );
  };
  return (
    <div className="plan-changes">
      <div className="table-scroll">
        <table className="diff-metrics">
          <thead>
            <tr>
              <th>Показатель</th>
              <th>Было</th>
              <th>Стало</th>
              <th>Разница</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Оставшихся заявок', 'total'],
              ['В маршрутах', 'assigned'],
              ['На согласовании', 'unassigned'],
              ['Инженеров', 'engineers'],
              ['Расстояние, км', 'km'],
              ['Ожидание срочных, мин', 'urgentResponse'],
            ].map(([label, key]) => {
              const delta = Number(
                (diff.metrics.after[key] - diff.metrics.before[key]).toFixed(key === 'km' ? 1 : 0),
              );
              const better = key === 'assigned' ? delta > 0 : delta < 0;
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{Number(diff.metrics.before[key]).toFixed(key === 'km' ? 1 : 0)}</td>
                  <td>{Number(diff.metrics.after[key]).toFixed(key === 'km' ? 1 : 0)}</td>
                  <td
                    className={
                      !delta || key === 'total'
                        ? 'delta-neutral'
                        : better
                          ? 'delta-positive'
                          : 'delta-negative'
                    }
                  >
                    {delta ? `${delta > 0 ? '+' : ''}${delta.toLocaleString('ru-RU')}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="analysis-note">
        При добавлении и удалении заявок объём работы меняется. Расстояния сравнивайте вместе с покрытием;
        качество поездок указано в плане.
      </p>
      <h3 className="changes-heading">Изменения заявок · {diff.jobChanges.length}</h3>
      {diff.jobChanges.length ? (
        <div className="table-scroll diff-list">
          <table>
            <thead>
              <tr>
                <th>Заявка</th>
                <th>Изменения</th>
                <th>Было</th>
                <th>Стало</th>
              </tr>
            </thead>
            <tbody>
              {diff.jobChanges.map((c) => (
                <tr key={c.jobId}>
                  <td>
                    №{c.number}
                    <small>{c.title}</small>
                  </td>
                  <td>{c.kinds.map((k) => labels[k]).join(' · ')}</td>
                  <td>
                    {stop(c.before)}
                    {details(c, 'before')}
                  </td>
                  <td>
                    {stop(c.after)}
                    {details(c, 'after')}
                    {c.after?.pinnedEngineerId && <small>Исполнитель закреплён</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Назначения и расписание не изменились.</p>
      )}
      <h3 className="changes-heading">Изменения маршрутов · {diff.routeChanges.length}</h3>
      {diff.routeChanges.length ? (
        <div className="table-scroll route-diff-list">
          <table className="route-diff-table">
            <thead>
              <tr>
                <th>Инженер</th>
                <th>Визиты</th>
                <th>Расстояние, км</th>
              </tr>
            </thead>
            <tbody>
              {diff.routeChanges.map((c) => (
                <tr key={c.engineerId}>
                  <td>{engineerName(c.engineerId)}</td>
                  <td>
                    {c.before?.stops.length || 0} → {c.after?.stops.length || 0}
                  </td>
                  <td>
                    {(c.before?.km || 0).toFixed(1)} → {(c.after?.km || 0).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Маршруты не изменились.</p>
      )}
    </div>
  );
}

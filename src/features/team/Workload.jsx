import React, { useState } from 'react';
import { duration } from '../../shared/format.js';
export function WorkloadSummary({ metrics: m }) {
  if (!m) return null;
  return (
    <div className="workload-summary">
      <span>
        Работа за день<b>{duration(m.projected.work)}</b>
      </span>
      <span>
        Дорога за день<b>{duration(m.projected.travel)}</b>
      </span>
      <span>
        Маршрут за день · расчёт<b>{m.projected.km.toFixed(2)} км</b>
      </span>
      <span>
        Загрузка работой<b>{Math.round(m.utilization * 100)}%</b>
      </span>
      <small>
        Уже работал {duration(m.past.work)} · осталось {duration(m.remaining.work)}. Прошлые смены:{' '}
        {m.historyKnown
          ? `${duration(m.history.workMinutes)} работы / ${duration(m.history.availableMinutes)} доступно`
          : 'данных нет'}
        .
      </small>
    </div>
  );
}
export default function WorkloadTable({ state }) {
  const [scope, setScope] = useState('projected');
  const labels = {
    past: 'К текущему времени',
    remaining: 'Оставшийся план',
    projected: 'Весь день: прошло + план',
  };
  const rows = state.plan.engineerMetrics || [];
  const total = (key) => rows.reduce((sum, r) => sum + r[scope][key], 0);
  return (
    <section className="panel analytics-card workload-panel">
      <div className="panel-heading">
        <div>
          <h2>Нагрузка инженеров</h2>
          <p>Работа на объектах отдельно от дороги и свободного времени</p>
        </div>
        <select aria-label="Период метрик инженеров" value={scope} onChange={(e) => setScope(e.target.value)}>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Инженер</th>
              <th>Работа</th>
              <th>Дорога</th>
              <th>Ожидание</th>
              <th>Перерыв</th>
              <th>Свободно</th>
              <th>Км · расчёт</th>
              <th>Работа / смена</th>
              <th>Прошлые смены</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const v = m[scope],
                e = state.engineers.find((e) => e.id === m.engineerId);
              return (
                <tr key={m.engineerId}>
                  <td>{e?.name}</td>
                  {['work', 'travel', 'wait', 'break', 'free'].map((k) => (
                    <td key={k}>{duration(v[k])}</td>
                  ))}
                  <td>
                    {v.km.toFixed(2)}
                    <small className="cell-detail">
                      {m.distanceSource === 'none'
                        ? 'нет маршрута'
                        : m.distanceSource === 'estimate'
                          ? 'оценка'
                          : 'дорожная сеть'}
                    </small>
                  </td>
                  <td>
                    {Math.round(m.utilization * 100)}%<small className="cell-detail">весь день</small>
                  </td>
                  <td>
                    {m.historyKnown ? (
                      <>
                        {duration(m.history.workMinutes)} / {duration(m.history.availableMinutes)}
                        <small className="cell-detail">{m.history.label || 'период не указан'}</small>
                      </>
                    ) : (
                      'Нет данных'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>Всего</th>
              {['work', 'travel', 'wait', 'break', 'free'].map((k) => (
                <td key={k}>{duration(total(k))}</td>
              ))}
              <td>{total('km').toFixed(2)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="analysis-note">
        Загрузка = работа на объектах / (смена − перерывы). Ожидание — время до клиентского окна после
        прибытия. Свободно — остальная часть смены. Километры и дорога рассчитаны по маршрутам, без GPS-трека;
        общественный транспорт оценочный. Прошедшее время в демонстрации берётся из событий симуляции.
      </p>
      {state.settings.balanceWork && (
        <p className="analysis-note">
          Баланс включён: учитываются предыдущая работа, доступное время прошлых смен и работа текущего дня.
          Историю нужно задавать за сопоставимый период; отсутствие истории означает нулевую исходную
          нагрузку.
        </p>
      )}
    </section>
  );
}

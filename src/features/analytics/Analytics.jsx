import React from 'react';
import { Avatar } from '../../components/ui.jsx';
import { duration, time } from '../../shared/format.js';
export default function Analytics({ state }) {
  const m = state.plan.metrics,
    done = state.jobs.filter((j) => j.status === 'done');
  const onTime = done.filter((j) => j.actualStart >= j.windowStart && j.actualStart <= j.windowEnd);
  return (
    <div className="analytics-grid">
      <section className="panel analytics-card">
        <div className="panel-heading">
          <div>
            <h2>ALNS и базовый алгоритм</h2>
            <p>Одинаковые заявки, состав инженеров и оценка поездок</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>План</th>
                <th>Заявок*</th>
                <th>Инженеров</th>
                <th>Путь*</th>
                <th>Время*</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>ALNS</td>
                <td>{m.assigned - state.plan.routes.filter((r) => r.locked).length}</td>
                <td>{m.usedEngineers}</td>
                <td>{m.pendingKm.toFixed(1)} км</td>
                <td>{duration(m.pendingTravel)}</td>
              </tr>
              <tr>
                <td>Первый доступный</td>
                <td>{m.baselineAssigned}</td>
                <td>{m.baselineUsedEngineers}</td>
                <td>{m.baselineKm.toFixed(1)} км</td>
                <td>{duration(m.baselineTravel)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="analysis-note">
          * Ещё не начатые визиты. Инженеры с текущим выездом входят в оба плана.{' '}
          {m.comparable
            ? 'Набор размещённых заявок совпадает.'
            : 'Наборы заявок различаются: меньшее расстояние само по себе не означает лучший план.'}{' '}
          Километраж и общественный транспорт оценочные.
        </p>
        <div className="analysis-meta">
          <span>
            Расчёт <b>{m.computeMs} мс</b>
          </span>
          <span>
            Изменено <b>{m.changes}</b>
          </span>
          <span>
            На согласовании <b>{m.unassigned}</b>
          </span>
        </div>
        <p className="analysis-note">{state.plan.algorithm}</p>
        {state.plan.changes.length > 0 && (
          <div>
            <h3>Изменения после пересчёта</h3>
            {state.plan.changes.slice(0, 10).map((c) => (
              <p key={c.jobId}>
                №{state.jobs.find((j) => j.id === c.jobId)?.number}: {time(c.before.start)} →{' '}
                {c.after ? time(c.after.start) : 'требует согласования'}
                {c.after && c.before.engineerId !== c.after.engineerId ? ' · изменён инженер' : ''}
              </p>
            ))}
          </div>
        )}
      </section>
      <section className="panel analytics-card">
        <div className="panel-heading">
          <div>
            <h2>Начало работ в клиентском окне</h2>
            <p>Фактические результаты завершённых визитов</p>
          </div>
        </div>
        <div className="accuracy-number">
          {done.length ? `${Math.round((onTime.length / done.length) * 100)}%` : '—'}
          <span>начато в согласованное время</span>
        </div>
        <p className="analysis-note">
          Завершение после конца окна не считается опозданием: работа должна помещаться в смену.
        </p>
        <div className="accuracy-bars">
          {state.engineers.map((e) => (
            <div key={e.id}>
              <Avatar engineer={e} size="small" />
              <span>{e.name}</span>
              <b>{done.filter((j) => j.engineerId === e.id).length} выполнено</b>
            </div>
          ))}
        </div>
        {state.dataset && <p className="analysis-note">Синтетический штат: {state.dataset.roster.method}</p>}
      </section>
    </div>
  );
}

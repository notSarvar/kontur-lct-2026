import React from 'react';
import { Avatar } from '../../components/ui.jsx';
import { duration } from '../../shared/format.js';
import PlanChanges from '../plans/PlanChanges.jsx';
import WorkloadTable from '../team/Workload.jsx';
import SolverComparison from './SolverComparison.jsx';
export default function Analytics({ state, demo = false }) {
  const m = state.plan.metrics,
    done = state.jobs.filter((j) => j.status === 'done');
  const onTime = done.filter((j) => j.actualStart >= j.windowStart && j.actualStart <= j.windowEnd);
  return (
    <div className="analytics-grid">
      {demo && <SolverComparison state={state} />}
      {!demo && <WorkloadTable state={state} />}
      {demo ? (
        <section className="panel analytics-card">
          <div className="panel-heading">
            <div>
              <h2>Текущий план и базовый алгоритм</h2>
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
                  <td>{state.plan.solver === 'ortools' ? 'Google OR-Tools' : 'ALNS'}</td>
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
            {state.plan.roadSource === 'prepared'
              ? 'Пешие поездки — по сохранённой дорожной матрице; общественный транспорт — оценка.'
              : 'Километраж и общественный транспорт оценочные.'}
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
          <p className="analytics-mode">
            Режим: <b>{state.plan.mode === 'emergency' ? 'Аварийное реагирование' : 'Экономия'}</b>
          </p>
          {state.plan.diff && <PlanChanges diff={state.plan.diff} engineers={state.engineers} />}
        </section>
      ) : (
        <section className="panel analytics-card">
          <div className="panel-heading">
            <div>
              <h2>Итоги рабочего дня</h2>
              <p>Выполнение плана и загрузка команды</p>
            </div>
          </div>
          <dl className="operational-results">
            <div>
              <dt>Выполнено заявок</dt>
              <dd>
                {done.length} из {state.jobs.length}
              </dd>
            </div>
            <div>
              <dt>Осталось в маршрутах</dt>
              <dd>{m.assigned}</dd>
            </div>
            <div>
              <dt>На согласовании</dt>
              <dd>{m.unassigned}</dd>
            </div>
            <div>
              <dt>Инженеры с выездами</dt>
              <dd>
                {m.usedEngineers} из {state.engineers.length}
              </dd>
            </div>
            <div>
              <dt>Оставшаяся работа на объектах</dt>
              <dd>
                {duration(
                  state.plan.engineerMetrics?.reduce((sum, e) => sum + e.remaining.work, 0) ?? m.work,
                )}
              </dd>
            </div>
            <div>
              <dt>Оставшееся время в пути · оценка</dt>
              <dd>{duration(m.travel)}</dd>
            </div>
          </dl>
          {state.plan.diff && <PlanChanges diff={state.plan.diff} engineers={state.engineers} />}
        </section>
      )}
      {!demo && (
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
        </section>
      )}
    </div>
  );
}

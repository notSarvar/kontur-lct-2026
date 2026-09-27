import React, { useState } from 'react';
import { Button } from '../../components/ui.jsx';
import { duration } from '../../shared/format.js';
const names = {
  unassignedUrgent: 'Неназначенные срочные',
  unassigned: 'Неназначенные',
  usedEngineers: 'Инженеры',
  urgentResponseSeconds: 'Ожидание срочных, с',
  workBalance: 'Баланс работы',
  changedAssignments: 'Переназначения',
  distanceMetres: 'Расстояние, м',
  travelSeconds: 'Дорога, с',
};
export default function SolverComparison({ state }) {
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/optimizers/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel analytics-card solver-comparison">
      <div className="panel-heading">
        <div>
          <h2>Сравнение ALNS и Google OR-Tools</h2>
          <p>Один снимок заявок, ограничений и дорожной матрицы</p>
        </div>
        <Button onClick={run} disabled={busy}>
          {busy ? 'Идёт сравнение…' : 'Сравнить алгоритмы'}
        </Button>
      </div>
      <p className="analysis-note">
        ALNS: {state.settings.alnsIterations ?? 60} итераций × {state.settings.alnsRestarts ?? 1} запусков.
        OR-Tools: {state.settings.ortoolsSeconds ?? 10} с на модель и поиск. Рабочий план не меняется. Бюджеты
        меняются в настройках.
      </p>
      {error && (
        <p role="alert" className="analysis-note late">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.revision !== state.revision && (
            <p className="analysis-note">
              Это результат для ревизии {result.revision}; рабочий день уже изменился.
            </p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Алгоритм</th>
                  <th>Размещено*</th>
                  <th>Инженеров</th>
                  <th>Км*</th>
                  <th>В пути*</th>
                  <th>Расчёт</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Первый доступный · ТЗ</td>
                  <td>{result.baseline.assigned}</td>
                  <td>{result.baseline.engineers}</td>
                  <td>{result.baseline.km.toFixed(2)}</td>
                  <td>{duration(result.baseline.travel)}</td>
                  <td>—</td>
                </tr>
                {[result.alns, result.ortools].map((r) => (
                  <tr key={r.solver}>
                    <td>{r.solver === 'alns' ? 'ALNS' : 'Google OR-Tools'}</td>
                    <td>{r.jobIds.length}</td>
                    <td>{r.metrics.usedEngineers}</td>
                    <td>{r.metrics.pendingKm.toFixed(2)}</td>
                    <td>{duration(r.metrics.pendingTravel)}</td>
                    <td>{(r.metrics.computeMs / 1000).toFixed(2)} с</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="analysis-note">
            * Ещё не начатые визиты.{' '}
            {result.sameAssignedJobs
              ? 'Оба решателя разместили одинаковый набор заявок.'
              : 'Наборы размещённых заявок различаются: напрямую сравнивать только километры нельзя.'}{' '}
            На согласовании вне поиска: {result.heldForReview}. {result.roadDetail}
          </p>
          <p className="analysis-note">
            OR-Tools {result.ortools.diagnostics.version}, CP-SAT.{' '}
            {result.ortools.diagnostics.retainedInitial || !result.ortools.diagnostics.found
              ? 'Лучше общего начального плана за этот бюджет не найдено; сохранён начальный план.'
              : 'Получен и проверен план решателя.'}{' '}
            {result.ortools.diagnostics.allStagesOptimal
              ? 'Все этапы доказаны оптимальными в целочисленной модели.'
              : 'Глобальная оптимальность не доказана.'}{' '}
            ALNS также не гарантирует оптимум.
          </p>
          <details className="solver-details">
            <summary>Приоритеты и статусы поиска</summary>
            <p>
              Лексикографические цели ALNS: {result.alns.objective.join(' → ')}
              <br />
              OR-Tools: {result.ortools.objective.join(' → ')}
            </p>
            <ul>
              {result.ortools.diagnostics.stages?.map((s) => (
                <li key={s.name}>
                  {names[s.name] || s.name}: {s.status} · значение {s.value ?? '—'} · граница {s.bound ?? '—'}
                </li>
              ))}
            </ul>
            <p>
              При лимите времени следующий этап фиксирует лучший найденный результат предыдущего. Оптимум
              модели не означает точность исходной оценки дорог.
            </p>
          </details>
        </>
      )}
    </section>
  );
}

import React, { useMemo, useState } from 'react';
import { Modal, Button } from '../../components/ui.jsx';
import RouteMap from '../../components/RouteMap.jsx';
import PlanChanges from './PlanChanges.jsx';

const plural = (n, forms) =>
  forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2];
const signed = (value, digits = 0) =>
  `${value > 0 ? '+' : ''}${value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const travelLabel = (plan) =>
  plan.roadSource === 'prepared'
    ? 'Пешая дорожная матрица'
    : plan.roadSource === 'osrm'
      ? 'Дорожный расчёт'
      : 'Оценка по средней скорости';

export default function PlanPreview({ candidate, revision, busy, apply, onClose }) {
  const affectedIds = useMemo(
    () => [
      ...new Set([
        ...candidate.diff.routeChanges.map((route) => route.engineerId),
        ...candidate.diff.jobChanges
          .flatMap((job) => [job.before?.engineerId, job.after?.engineerId])
          .filter(Boolean),
      ]),
    ],
    [candidate],
  );
  const [selected, setSelected] = useState(() => (affectedIds.length ? 'changed' : 'all'));
  const stale = revision !== candidate.baseRevision;
  const engineers = [
    ...new Map([...candidate.before.engineers, ...candidate.after.engineers].map((e) => [e.id, e])).values(),
  ];
  const visibleIds = useMemo(
    () => (selected === 'changed' ? affectedIds : selected === 'all' ? undefined : [selected]),
    [selected, affectedIds],
  );
  const changedJobIds = useMemo(() => candidate.diff.jobChanges.map((job) => job.jobId), [candidate]);
  // Both views use the same extent, including removed visits and the old route.
  const boundsPoints = useMemo(
    () =>
      [candidate.before, candidate.after].flatMap((snapshot) => {
        const routeJobs = new Set(
          snapshot.plan.routes
            .filter((r) => !visibleIds || visibleIds.includes(r.engineerId))
            .flatMap((r) => r.stops.map((s) => s.jobId)),
        );
        return [
          ...snapshot.jobs.filter(
            (job) =>
              !visibleIds ||
              routeJobs.has(job.id) ||
              (selected === 'changed' && changedJobIds.includes(job.id)),
          ),
          ...snapshot.engineers
            .filter((e) => !visibleIds || visibleIds.includes(e.id))
            .map((e) => e.position),
        ]
          .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
          .map((point) => [point.lat, point.lng]);
      }),
    [candidate, selected, visibleIds, changedJobIds],
  );
  const count = candidate.diff.jobChanges.length;
  const km = candidate.diff.metrics.after.km - candidate.diff.metrics.before.km;
  const unassigned = candidate.diff.metrics.after.unassigned - candidate.diff.metrics.before.unassigned;
  const late = candidate.after.plan.metrics.late || 0;
  return (
    <Modal
      title="Предпросмотр изменений"
      subtitle="Действующий план сохранится до подтверждения"
      onClose={onClose}
      wide
      className="preview-dialog"
    >
      <div className="modal-body preview-body">
        <section className="preview-summary" aria-label="Сводка изменений">
          <h3>
            {count
              ? `Изменится ${count} ${plural(count, ['заявка', 'заявки', 'заявок'])}`
              : 'Назначения не изменятся'}
            {affectedIds.length > 0 &&
              ` у ${affectedIds.length} ${plural(affectedIds.length, ['инженера', 'инженеров', 'инженеров'])}`}
          </h3>
          <div className="preview-summary-facts">
            <span className={km > 0.05 ? 'delta-negative' : km < -0.05 ? 'delta-positive' : ''}>
              {signed(km, 1)} км
            </span>
            <span className={unassigned > 0 ? 'delta-negative' : unassigned < 0 ? 'delta-positive' : ''}>
              На согласовании: {signed(unassigned)}
            </span>
            <span className={late ? 'delta-negative' : 'delta-positive'}>
              {late ? `Нарушений окон: ${late}` : 'Нарушений окон нет'}
            </span>
          </div>
          {affectedIds.length > 0 && (
            <p>
              Затронуты:{' '}
              {engineers
                .filter((e) => affectedIds.includes(e.id))
                .map((e) => e.name)
                .join(', ')}
            </p>
          )}
        </section>
        {stale && (
          <p role="alert" className="preview-warning">
            План изменился после расчёта. Закройте предпросмотр и проверьте изменение заново.
          </p>
        )}
        {candidate.validation.violations.map((v, i) => (
          <p role="alert" className="preview-warning" key={i}>
            {v.message}
          </p>
        ))}
        <label className="field">
          <span>Маршруты на карте</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {affectedIds.length > 0 && (
              <option value="changed">Только изменённые · {affectedIds.length}</option>
            )}
            <option value="all">Вся команда</option>
            {engineers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="preview-maps">
          {[
            [candidate.before, 'Было'],
            [candidate.after, 'Стало'],
          ].map(([snapshot, label]) => (
            <section key={label}>
              <h3>{label}</h3>
              <p>
                {snapshot.settings.mode === 'emergency' ? 'Аварийное реагирование' : 'Экономия'} ·{' '}
                {travelLabel(snapshot.plan)}
              </p>
              <RouteMap
                state={snapshot}
                engineerIds={visibleIds}
                boundsPoints={boundsPoints}
                unassignedJobIds={selected === 'changed' ? changedJobIds : undefined}
                compact
              />
            </section>
          ))}
        </div>
        <PlanChanges diff={candidate.diff} engineers={engineers} />
        <p className="preview-policy">Расчёт поездок: {candidate.after.plan.roadDetail}</p>
      </div>
      <footer className="preview-actions">
        <Button onClick={onClose} disabled={busy}>
          Отменить изменения
        </Button>
        <Button
          variant="primary"
          aria-label="Применить план"
          disabled={busy || stale || !candidate.canApply}
          onClick={apply}
        >
          Применить план{count > 0 && <span className="apply-count"> · {count}</span>}
        </Button>
      </footer>
    </Modal>
  );
}

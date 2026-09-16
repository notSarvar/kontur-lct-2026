import React, { useState } from 'react';
import { Modal, Button } from '../../components/ui.jsx';
import RouteMap from '../../components/RouteMap.jsx';
import PlanChanges from './PlanChanges.jsx';
export default function PlanPreview({ candidate, revision, busy, apply, onClose }) {
  const [selected, setSelected] = useState('all');
  const stale = revision !== candidate.baseRevision;
  const engineers = [
    ...new Map([...candidate.before.engineers, ...candidate.after.engineers].map((e) => [e.id, e])).values(),
  ];
  return (
    <Modal
      title="Предпросмотр изменений"
      subtitle="Действующий план сохранится до подтверждения"
      onClose={onClose}
      wide
    >
      <div className="modal-body preview-body">
        <p className="preview-policy">
          Режим:{' '}
          <b>{candidate.after.settings.mode === 'emergency' ? 'Аварийное реагирование' : 'Экономия'}</b> ·{' '}
          {candidate.after.plan.roadDetail}
        </p>
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
          <span>Маршрут для сравнения</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="all">Вся команда</option>
            {engineers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="preview-maps">
          <section>
            <h3>Было</h3>
            <p>
              {candidate.before.settings.mode === 'emergency' ? 'Аварийное реагирование' : 'Экономия'} ·{' '}
              {candidate.before.plan.roadSource === 'prepared'
                ? 'Пешая дорожная матрица'
                : 'Источник поездок: ' + candidate.before.plan.roadSource}
            </p>
            <RouteMap state={candidate.before} selected={selected} compact />
          </section>
          <section>
            <h3>Стало</h3>
            <p>
              {candidate.after.settings.mode === 'emergency' ? 'Аварийное реагирование' : 'Экономия'} ·{' '}
              {candidate.after.plan.roadSource === 'prepared'
                ? 'Пешая дорожная матрица'
                : 'Источник поездок: ' + candidate.after.plan.roadSource}
            </p>
            <RouteMap state={candidate.after} selected={selected} compact />
          </section>
        </div>
        <PlanChanges diff={candidate.diff} engineers={engineers} />
        <div className="form-actions">
          <Button onClick={onClose} disabled={busy}>
            Отменить изменения
          </Button>
          <Button variant="primary" disabled={busy || stale || !candidate.canApply} onClick={apply}>
            Применить план
          </Button>
        </div>
      </div>
    </Modal>
  );
}

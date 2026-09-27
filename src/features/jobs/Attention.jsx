import React from 'react';
import { ArrowRight, CheckCheck, MapPin, TriangleAlert } from 'lucide-react';
import { Button } from '../../components/ui.jsx';

export default function Attention({ state, jobs, onJob, onAll, onGeography }) {
  const issues = [...jobs].sort(
    (a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.windowEnd - b.windowEnd,
  );
  const geography = state.geography?.issues.length || 0;
  return (
    <section
      className={`attention-block ${issues.length ? 'has-issues' : 'clear'}`}
      aria-label="Требует внимания"
    >
      <div className="attention-heading">
        <div>
          {issues.length ? <TriangleAlert size={20} /> : <CheckCheck size={20} />}
          <h2>{issues.length ? 'Требует внимания' : 'Нет заявок, требующих решения'}</h2>
          {issues.length > 0 && <span className="attention-count">{issues.length}</span>}
        </div>
        <div>
          {geography > 0 && (
            <Button icon={MapPin} onClick={onGeography}>
              Проверить адреса · {geography}
            </Button>
          )}
          {issues.length > 0 && (
            <Button icon={ArrowRight} onClick={onAll}>
              Все проблемные заявки
            </Button>
          )}
        </div>
      </div>
      {issues.length > 0 && (
        <div className="attention-items">
          {issues.slice(0, 3).map((j) => {
            const reason = state.plan.unassigned.find((item) => item.jobId === j.id)?.text;
            return (
              <button
                className={`attention-item ${j.priority === 'urgent' || j.status === 'blocked' ? 'critical' : ''}`}
                key={j.id}
                onClick={() => onJob(j.id)}
              >
                <span className="attention-item-top">
                  <b>№{j.number}</b>
                  <span>
                    {j.status === 'blocked'
                      ? 'Нужна помощь'
                      : j.priority === 'urgent'
                        ? 'Срочная · без решения'
                        : 'Требует согласования'}
                  </span>
                  <ArrowRight size={15} />
                </span>
                <strong title={j.address}>{j.address}</strong>
                <small>{reason || 'Проверьте обращение инженера и время визита.'}</small>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

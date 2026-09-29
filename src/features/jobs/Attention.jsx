import React from 'react';
import { ArrowRight, CheckCheck, TriangleAlert } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { time } from '../../shared/format.js';

export default function Attention({ state, jobs, onJob, onAll }) {
  const issues = [...jobs].sort(
    (a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.windowEnd - b.windowEnd,
  );
  const needsAddress = (job) => !Number.isFinite(job.lat) || !Number.isFinite(job.lng);
  const addressIssues = issues.filter(needsAddress);
  const planningIssues = issues.filter((job) => !needsAddress(job));
  const groups = [
    { title: 'Нужно согласовать', jobs: planningIssues, limit: 2 },
    { title: 'Адрес не подтверждён', jobs: addressIssues, limit: 1 },
  ].filter((group) => group.jobs.length);
  return (
    <section
      className={`attention-block ${issues.length ? 'has-issues' : 'clear'}`}
      aria-label="Требует внимания"
    >
      <div className="attention-heading">
        <div className="attention-heading-copy">
          <div className="attention-title">
            <span className="attention-symbol">
              {issues.length ? <TriangleAlert size={19} /> : <CheckCheck size={19} />}
            </span>
            <h2>{issues.length ? 'Требует внимания' : 'Нет заявок, требующих решения'}</h2>
            {issues.length > 0 && <span className="attention-count">{issues.length}</span>}
          </div>
        </div>
        <div className="attention-actions">
          {issues.length > 0 && (
            <Button icon={ArrowRight} onClick={onAll}>
              Все проблемные заявки
            </Button>
          )}
        </div>
      </div>
      {issues.length > 0 && (
        <div className="attention-items">
          {groups.map((group) => (
            <div className="attention-group" key={group.title}>
              <p className="attention-group-label">
                {group.title} <span>{group.jobs.length}</span>
              </p>
              {group.jobs.slice(0, group.limit).map((job) => {
                const reason = state.plan.unassigned.find((item) => item.jobId === job.id)?.text;
                return (
                  <button
                    className={`attention-item ${job.priority === 'urgent' || job.status === 'blocked' ? 'critical' : ''}`}
                    key={job.id}
                    onClick={() => onJob(job.id)}
                  >
                    <span className="attention-item-top">
                      <b>№{job.number}</b>
                      {job.priority === 'urgent' && <span className="attention-urgent">Срочная</span>}
                      <time>окно до {time(job.windowEnd)}</time>
                    </span>
                    <strong title={job.address}>{job.address}</strong>
                    <small>{reason || 'Проверьте обращение инженера и время визита.'}</small>
                    <span className="attention-item-action">
                      {needsAddress(job) ? 'Уточнить адрес' : 'Открыть заявку'}
                      <ArrowRight size={14} />
                    </span>
                  </button>
                );
              })}
              {group.jobs.length > group.limit && (
                <button className="text-button attention-more" onClick={onAll}>
                  Ещё {group.jobs.length - group.limit} в списке заявок <ArrowRight size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

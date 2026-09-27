import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Plus, ArrowUpRight } from 'lucide-react';
import { Avatar, Button, Empty } from '../../components/ui.jsx';
import { time } from '../../shared/format.js';
import { engineerStatus } from './availability.js';
import { WorkloadSummary } from './Workload.jsx';

export default function TeamPlan({ state, selected, onJob, onEngineer, onAdd }) {
  const [expanded, setExpanded] = useState(new Set());
  useEffect(() => {
    if (selected !== 'all') setExpanded((old) => new Set([...old, selected]));
  }, [selected]);
  const routes = state.plan.routes.filter((r) => selected === 'all' || r.engineerId === selected);
  const allOpen = routes.length > 0 && routes.every((r) => expanded.has(r.engineerId));
  function toggle(id) {
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <section className="panel team-plan-panel">
      <div className="panel-heading">
        <h2>План команды</h2>
        <button
          className="icon-button"
          aria-label="Добавить инженера"
          title="Добавить инженера"
          onClick={onAdd}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="team-plan-toolbar">
        <span>Оставшиеся визиты по инженерам</span>
        <button
          className="text-button"
          onClick={() => setExpanded(allOpen ? new Set() : new Set(routes.map((r) => r.engineerId)))}
        >
          {allOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
          {allOpen ? 'Свернуть все' : 'Развернуть все'}
        </button>
      </div>
      <div className="route-list">
        {routes.map((route) => {
          const e = state.engineers.find((person) => person.id === route.engineerId);
          const status = engineerStatus(state, e);
          const isOpen = expanded.has(e.id);
          return (
            <article className={`compact-route ${status.tone}`} key={e.id}>
              <button
                className="compact-route-toggle"
                aria-expanded={isOpen}
                aria-controls={`route-${e.id}`}
                onClick={() => toggle(e.id)}
              >
                <Avatar engineer={e} />
                <span className="compact-route-name">
                  <b>{e.name}</b>
                  <small>{status.label}</small>
                </span>
                <span className="visit-count">
                  {route.stops.length}
                  <small>выездов</small>
                </span>
                <ChevronDown size={16} className={isOpen ? 'rotated' : ''} />
              </button>
              {isOpen && (
                <div className="compact-route-body" id={`route-${e.id}`}>
                  <WorkloadSummary metrics={state.plan.engineerMetrics?.find((m) => m.engineerId === e.id)} />
                  {route.stops.map((s) => {
                    const j = state.jobs.find((job) => job.id === s.jobId);
                    return (
                      <button
                        className={`compact-stop ${j.priority === 'urgent' ? 'urgent' : ''}`}
                        key={j.id}
                        onClick={() => onJob(j.id)}
                      >
                        <time>
                          {time(s.start)}
                          <small>{time(s.end)}</small>
                        </time>
                        <span>
                          <b title={j.address}>{j.address}</b>
                          <small>
                            №{j.number} · {j.priority === 'urgent' ? 'Срочная · ' : ''}
                            {j.title}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                  {!route.stops.length && <p className="empty-inline">Нет запланированных выездов</p>}
                  <Button icon={ArrowUpRight} onClick={() => onEngineer(e.id)}>
                    Карточка инженера
                  </Button>
                </div>
              )}
            </article>
          );
        })}
        {!routes.length && <Empty text="Нет инженеров для отображения" />}
      </div>
    </section>
  );
}

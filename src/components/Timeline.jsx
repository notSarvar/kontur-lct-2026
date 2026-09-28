import React, { useEffect, useRef, useState } from 'react';
import { time } from '../shared/format.js';
import { Avatar } from './ui.jsx';

export default function Timeline({ state, selected, onJob, focusWindow }) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef(null);
  const start = Math.floor(Math.min(480, ...state.engineers.map((e) => e.shiftStart)) / 60) * 60;
  const end = 1440;
  const span = end - start;
  const width = span * 2.4 * zoom;
  const percent = (minute) => ((minute - start) / span) * 100;
  const jobs = new Map(state.jobs.map((job) => [job.id, job]));
  const routes = state.plan.routes.filter((r) => selected === 'all' || r.engineerId === selected);
  useEffect(() => {
    const target = focusWindow?.start ?? state.time;
    if (viewport.current) viewport.current.scrollLeft = Math.max(0, (target - start) * 2.4 * zoom - 40);
  }, [focusWindow, zoom, selected, start]);
  return (
    <div className="gantt">
      <div className="gantt-toolbar">
        <div className="gantt-legend" aria-label="Обозначения графика">
          <span>
            <i className="gantt-work-key" aria-hidden="true" /> Запланировано
          </span>
          <span>
            <i className="gantt-progress-key" aria-hidden="true" /> В работе
          </span>
          <span>
            <i className="gantt-travel-key" aria-hidden="true" /> Дорога
          </span>
          <span>
            <i className="gantt-urgent-key" aria-hidden="true" /> Срочная
          </span>
        </div>
        <label>
          Масштаб{' '}
          <select aria-label="Масштаб графика" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            <option value="0.5">Обзор</option>
            <option value="1">Обычный</option>
            <option value="2">Крупный</option>
          </select>
        </label>
      </div>
      {focusWindow && (
        <p className="gantt-focus-note">
          Свободное окно: {time(focusWindow.start)}–{time(focusWindow.end)} · без учёта новой поездки
        </p>
      )}
      <div
        className="gantt-scroll"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="График инженеров с горизонтальной прокруткой"
      >
        <div
          className="gantt-content"
          style={{ width: width + 148, '--hour-width': `${width / (span / 60)}px` }}
        >
          <div className="gantt-axis">
            <div className="gantt-corner">Инженер</div>
            <div className="gantt-hours">
              {Array.from({ length: span / 60 + 1 }, (_, i) => (
                <time key={i} style={{ left: `${((i * 60) / span) * 100}%` }}>
                  {time(start + i * 60)}
                </time>
              ))}
            </div>
          </div>
          {routes.map((r) => {
            const e = state.engineers.find((person) => person.id === r.engineerId);
            return (
              <div className="timeline-row gantt-row" key={e.id}>
                <div className="gantt-person">
                  <Avatar engineer={e} size="small" />
                  <b title={e.name}>{e.name}</b>
                </div>
                <div className="gantt-track">
                  {state.time >= start && state.time <= end && (
                    <i
                      className="gantt-now"
                      style={{ left: `${percent(state.time)}%` }}
                      title={`Сейчас ${time(state.time)}`}
                    />
                  )}
                  {focusWindow && selected === e.id && (
                    <div
                      className="gantt-free-window"
                      style={{
                        left: `${percent(focusWindow.start)}%`,
                        width: `${((focusWindow.end - focusWindow.start) / span) * 100}%`,
                      }}
                    />
                  )}
                  {r.stops.map((s) => {
                    const job = jobs.get(s.jobId);
                    const working = job.status === 'working';
                    const workStart = job.actualStart ?? s.start;
                    const progress = Math.min(
                      100,
                      Math.max(0, ((state.time - workStart) / Math.max(1, s.end - workStart)) * 100),
                    );
                    const label = `Заявка №${job.number} · ${job.title} · ${time(s.start)}–${time(s.end)} · ${job.address}${working ? ` · В работе: прошло ${Math.round(progress)}% планового времени` : ''}`;
                    return (
                      <React.Fragment key={s.jobId}>
                        <span
                          className="gantt-travel"
                          title={`Дорога: ${time(s.depart)}–${time(s.arrival)} · ${s.travel} мин`}
                          style={{ left: `${percent(s.depart)}%`, width: `${(s.travel / span) * 100}%` }}
                        />
                        <button
                          className={`gantt-job ${s.late ? 'problem' : job.priority === 'urgent' ? 'urgent' : ''} ${working ? 'working' : ''}`}
                          onClick={() => onJob(s.jobId)}
                          title={label}
                          aria-label={label}
                          style={{
                            left: `${percent(s.start)}%`,
                            width: `${((s.end - s.start) / span) * 100}%`,
                            '--job-progress': working ? `${progress}%` : undefined,
                          }}
                        >
                          <span>№{job.number}</span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="gantt-hint">
        Нажмите на визит, чтобы открыть заявку. Прокручивайте график по горизонтали или меняйте масштаб.
      </p>
    </div>
  );
}

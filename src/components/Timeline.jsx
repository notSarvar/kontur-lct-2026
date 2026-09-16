import React from 'react';

import { time } from '../shared/format.js';
import { Avatar } from '../components/ui.jsx';

export default function Timeline({ state, selected, onJob }) {
  return (
    <div className="timeline">
      <div className="timeline-axis">
        <span>08:00</span>
        <span>12:00</span>
        <span>16:00</span>
        <span>20:00</span>
        <span>24:00</span>
      </div>
      {state.plan.routes
        .filter((r) => selected === 'all' || r.engineerId === selected)
        .map((r) => {
          const e = state.engineers.find((e) => e.id === r.engineerId);
          return (
            <div className="timeline-row" key={e.id}>
              <div>
                <Avatar engineer={e} size="small" />
                <b>{e.name}</b>
              </div>
              <div className="timeline-track">
                <i className="now-line" style={{ left: `${((state.time - 480) / 960) * 100}%` }} />
                {r.stops.map((s) => (
                  <React.Fragment key={s.jobId}>
                    <span
                      className="timeline-travel"
                      style={{
                        left: `${((s.depart - 480) / 960) * 100}%`,
                        width: `${(s.travel / 960) * 100}%`,
                        background: e.color,
                      }}
                    />
                    <button
                      onClick={() => onJob(s.jobId)}
                      title={`${time(s.start)}–${time(s.end)}`}
                      style={{
                        left: `${((s.start - 480) / 960) * 100}%`,
                        width: `${((s.end - s.start) / 960) * 100}%`,
                        background: e.color,
                      }}
                    >
                      #{state.jobs.find((j) => j.id === s.jobId).number}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      <p className="timeline-note">
        Полосы — работа на объекте · штриховка — дорога · вертикаль — текущее время
      </p>
    </div>
  );
}

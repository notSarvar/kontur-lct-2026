import React from 'react';
import { ChevronRight, Zap } from 'lucide-react';
import { time, duration, statusText } from '../../shared/format.js';
import { Avatar, Badge } from '../../components/ui.jsx';

export default function JobsTable({ jobs, engineers, getStop, onJob }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Заявка / объект</th>
            <th>Окно начала</th>
            <th>Инженер</th>
            <th>План визита</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const e = engineers.find((e) => e.id === j.engineerId),
              s = getStop(j.id);
            return (
              <tr
                key={j.id}
                onClick={() => onJob(j.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onJob(j.id);
                }}
              >
                <td>
                  <b>
                    <span className="job-number">#{j.number}</span> {j.title}{' '}
                    {j.priority === 'urgent' && <Zap className="urgent-icon" size={13} />}
                  </b>
                  <small>{j.address}</small>
                </td>
                <td>
                  {time(j.windowStart)}–{time(j.windowEnd)}
                  <small>{j.duration} мин работы</small>
                </td>
                <td>
                  {e ? (
                    <span className="table-person">
                      <Avatar engineer={e} size="small" />
                      {e.name}
                    </span>
                  ) : (
                    <span className="muted">Не назначен</span>
                  )}
                </td>
                <td className={s?.late ? 'late' : ''}>
                  {j.status === 'done'
                    ? `${time(j.actualStart)}–${time(j.actualEnd)}`
                    : s
                      ? `${time(s.start)}–${time(s.end)}`
                      : '—'}
                </td>
                <td>
                  <Badge
                    tone={
                      j.status === 'done'
                        ? 'green'
                        : ['blocked', 'manual_review'].includes(j.status) || !e
                          ? 'orange'
                          : j.status === 'working'
                            ? 'purple'
                            : 'gray'
                    }
                  >
                    {j.status === 'pending' && !e ? 'Не назначена' : statusText[j.status]}
                  </Badge>
                </td>
                <td>
                  <ChevronRight size={15} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

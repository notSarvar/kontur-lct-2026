import React, { useState } from 'react';
import { time } from '../../shared/format.js';

export default function RecommendationGantt({ candidate, jobId }) {
  const [detail, setDetail] = useState('');
  const timeline = candidate.timeline;
  if (!timeline) return null;
  const { shiftStart, shiftEnd, now, current, proposed, windows, pausedUntil } = timeline;
  const span = Math.max(1, shiftEnd - shiftStart);
  const position = (value) => Math.max(0, Math.min(100, ((value - shiftStart) / span) * 100));
  const range = (start, end) => ({
    left: `${position(start)}%`,
    width: `${Math.max(0, position(end) - position(start))}%`,
  });
  const merged = [];
  for (const window of [...windows].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && window.start <= last.latestStart)
      last.latestStart = Math.max(last.latestStart, window.latestStart);
    else merged.push({ ...window });
  }
  const interval = (start, end) => (start === end ? time(start) : `${time(start)}–${time(end)}`);
  const bar = (start, end, kind, label, key, point = false) => {
    if (end < shiftStart || start > shiftEnd || (!point && end <= start)) return null;
    return (
      <span
        key={key}
        className={`recommendation-gantt-bar ${kind}${point ? ' point' : ''}`}
        style={range(start, end)}
        role="img"
        tabIndex={0}
        aria-label={label}
        title={label}
        onMouseEnter={() => setDetail(label)}
        onFocus={() => setDetail(label)}
        onClick={() => setDetail(label)}
      />
    );
  };
  const routeBars = (stops) => (
    <>
      {pausedUntil > now && bar(now, pausedUntil, 'pause', `Перерыв до ${time(pausedUntil)}`, 'pause')}
      {stops.map((stop) => (
        <React.Fragment key={stop.jobId}>
          {bar(
            stop.depart,
            stop.arrival,
            'travel',
            `Дорога к №${stop.jobId}: ${interval(stop.depart, stop.arrival)}`,
            `${stop.jobId}-travel`,
          )}
          {bar(
            stop.arrival,
            stop.start,
            'waiting',
            `Ожидание окна: ${interval(stop.arrival, stop.start)}`,
            `${stop.jobId}-wait`,
          )}
          {bar(
            stop.start,
            stop.end,
            stop.jobId === jobId ? 'urgent' : 'work',
            `${stop.locked ? 'Текущий выезд · ' : ''}${stop.jobId === jobId ? 'Срочная заявка' : `№${stop.jobId}`} · ${stop.label} · ${interval(stop.start, stop.end)}`,
            stop.jobId,
          )}
        </React.Fragment>
      ))}
    </>
  );
  return (
    <figure className="recommendation-gantt" aria-label={`Расписание ${candidate.name}`}>
      <figcaption>
        Смена {time(shiftStart)}–{time(shiftEnd)}
      </figcaption>
      <div className="recommendation-gantt-axis" aria-hidden="true">
        {[0, 1 / 3, 2 / 3, 1].map((fraction) => (
          <span key={fraction}>{time(Math.round(shiftStart + span * fraction))}</span>
        ))}
      </div>
      {[
        ['Текущий план', routeBars(current)],
        ['Со срочной заявкой', routeBars(proposed)],
        [
          'Можно начать',
          merged.map((w, i) =>
            bar(
              w.start,
              w.latestStart,
              'available',
              `Допустимое начало: ${interval(w.start, w.latestStart)}`,
              i,
              w.start === w.latestStart,
            ),
          ),
        ],
      ].map(([label, content]) => (
        <div className="recommendation-gantt-row" key={label}>
          <span>{label}</span>
          <div className="recommendation-gantt-track" aria-label={label}>
            {content}
            {now >= shiftStart && now <= shiftEnd && (
              <i
                className="recommendation-gantt-now"
                style={{ left: `${position(now)}%` }}
                title={`Сейчас ${time(now)}`}
              />
            )}
          </div>
        </div>
      ))}
      <div className="recommendation-gantt-legend">
        <span>
          <i className="work" />
          Работа
        </span>
        <span>
          <i className="travel" />
          Дорога
        </span>
        <span>
          <i className="waiting" />
          Ожидание
        </span>
        <span>
          <i className="urgent" />
          Срочная
        </span>
        <span>
          <i className="available" />
          Начало
        </span>
        {pausedUntil > now && (
          <span>
            <i className="pause" />
            Перерыв
          </span>
        )}
      </div>
      <p className="recommendation-gantt-detail" aria-live="polite">
        {detail ||
          `Вариант: ${time(candidate.start)}–${time(candidate.end)}. Нажмите на отрезок для деталей.`}
      </p>
      <details className="recommendation-gantt-windows">
        <summary>Интервалы начала · {merged.length}</summary>
        <ul>
          {merged.map((w, i) => (
            <li key={i}>{interval(w.start, w.latestStart)}</li>
          ))}
        </ul>
        <p>
          Это время начала, с учётом дороги и длительности работы. Визиты могут сдвинуться в пределах своих
          окон. Итоговый план проверьте в предпросмотре.
        </p>
      </details>
    </figure>
  );
}

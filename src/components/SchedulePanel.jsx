import React, { useState } from 'react';
import { CircleHelp, Clock3, MapPin, Maximize2, RefreshCw } from 'lucide-react';
import { Button, Modal } from './ui.jsx';
import RouteMap from './RouteMap.jsx';
import Timeline from './Timeline.jsx';
import { freeWindows } from '../features/team/availability.js';
import { time } from '../shared/format.js';

export default function SchedulePanel({
  state,
  selected,
  select,
  timeline,
  setTimeline,
  focusWindow,
  busy,
  onJob,
  onAvailability,
  onOptimize,
  onTravelInfo,
}) {
  const [expanded, setExpanded] = useState(false);
  const starts = state.engineers.flatMap((e) => freeWindows(state, e).map((w) => w.start));
  const freeNow = starts.filter((start) => start === state.time).length;
  const nextWindow = starts.length ? Math.min(...starts) : null;
  const title = timeline ? 'График выездов' : 'Карта выездов';
  const content = (
    <>
      <div className="panel-heading">
        <h2>{title}</h2>
        <div className="schedule-view-actions">
          <div className="small-segment" aria-label="Вид расписания">
            <button
              className={!timeline ? 'active' : ''}
              aria-pressed={!timeline}
              onClick={() => setTimeline(false)}
            >
              <MapPin size={15} />
              Карта
            </button>
            <button
              className={timeline ? 'active' : ''}
              aria-pressed={timeline}
              onClick={() => setTimeline(true)}
            >
              <Clock3 size={15} />
              График
            </button>
          </div>
          {!expanded && (
            <button
              className="icon-button"
              aria-label="Развернуть расписание"
              title="Развернуть расписание"
              onClick={() => setExpanded(true)}
            >
              <Maximize2 size={18} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Пересчитать план"
            title="Пересчитать план вручную"
            disabled={busy}
            onClick={() => {
              setExpanded(false);
              onOptimize();
            }}
          >
            <RefreshCw size={18} className={busy ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="schedule-toolbar">
        <select
          aria-label="Инженер на карте и графике"
          value={selected}
          onChange={(e) => select(e.target.value)}
        >
          <option value="all">Вся команда · {state.engineers.length}</option>
          {state.engineers.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <Button
          icon={Clock3}
          onClick={() => {
            setExpanded(false);
            onAvailability();
          }}
        >
          Свободный инженер{' '}
          <span className="button-count" title="Свободное окно от 30 минут">
            {freeNow ? `${freeNow} сейчас` : nextWindow !== null ? `с ${time(nextWindow)}` : 'нет окон'}
          </span>
        </Button>
      </div>
      {timeline ? (
        <Timeline
          state={state}
          selected={selected}
          focusWindow={focusWindow}
          onJob={(id) => {
            setExpanded(false);
            onJob(id);
          }}
        />
      ) : (
        <RouteMap
          state={state}
          selected={selected}
          onJob={(id) => {
            setExpanded(false);
            onJob(id);
          }}
        />
      )}
      <div className="map-footer">
        {!timeline && (
          <span>
            <i className="legend-line" />
            Маршрут <i className="legend-dot" />
            Объект <i className="legend-square" />
            Инженер
          </span>
        )}
        <button
          className="text-button"
          onClick={() => {
            setExpanded(false);
            onTravelInfo();
          }}
        >
          Время в пути: {state.plan.roadSource === 'prepared' ? 'смешанный расчёт' : 'оценка'}{' '}
          <CircleHelp size={14} />
        </button>
      </div>
    </>
  );
  return expanded ? (
    <Modal title={title} onClose={() => setExpanded(false)} className="schedule-dialog" wide>
      <div className="modal-body">
        <section className="map-panel expanded-schedule">{content}</section>
      </div>
    </Modal>
  ) : (
    <section className="panel map-panel">{content}</section>
  );
}

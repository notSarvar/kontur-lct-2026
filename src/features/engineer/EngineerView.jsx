import React from 'react';
import {
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  Clock3,
  Coffee,
  FileText,
  Navigation,
  Radio,
  Route,
  Sparkles,
  Users,
  Wifi,
  Wrench,
} from 'lucide-react';
import { time, minutes, transport } from '../../shared/format.js';
import { Button, Avatar, Badge, Event } from '../../components/ui.jsx';
import RouteMap from '../../components/RouteMap.jsx';
import { WorkloadSummary } from '../team/Workload.jsx';

export default function EngineerView({ state, engineer: e, setEngineer, tab, setTab, open, act, busy }) {
  const r = state.plan.routes.find((r) => r.engineerId === e.id),
    byId = Object.fromEntries(state.jobs.map((j) => [j.id, j]));
  const next = r.stops[0],
    job = next ? byId[next.jobId] : null,
    completed = state.jobs.filter((j) => j.engineerId === e.id && j.status === 'done');
  const events = state.notifications.filter((n) => n.engineerId === e.id || !n.engineerId);
  const workload = state.plan.engineerMetrics?.find((m) => m.engineerId === e.id);
  return (
    <>
      <div className="page-heading">
        <select
          aria-label="Выбрать инженера"
          value={e.id}
          onChange={(event) => setEngineer(event.target.value)}
        >
          {state.engineers.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="engineer-layout">
        <div className="phone-stage">
          <div className="phone">
            <div className="phone-status">
              <span>{time(state.time)}</span>
              <div className="phone-island" />
              <span>
                <Wifi size={13} />
                <span className="battery" />
              </span>
            </div>
            <div className="phone-content">
              <div className="phone-heading">
                <div>
                  <small>Хорошего рабочего дня,</small>
                  <h2>
                    {e.name} <span>✳</span>
                  </h2>
                </div>
                <Avatar engineer={e} />
              </div>
              {tab === 'route' ? (
                <>
                  <div className="phone-summary">
                    <div>
                      <b>
                        {Math.round(workload?.remaining.work ?? r.work)}
                        <small> мин</small>
                      </b>
                      <span>работы впереди</span>
                    </div>
                    <div>
                      <b>
                        {(workload?.remaining.km ?? r.totalKm).toFixed(1)}
                        <small> км</small>
                      </b>
                      <span>путь · расчёт</span>
                    </div>
                    <div>
                      <b>
                        {Math.round(workload?.remaining.travel ?? r.remainingDrive)}
                        <small> мин</small>
                      </b>
                      <span>в дороге</span>
                    </div>
                  </div>
                  <div className="phone-map">
                    <RouteMap
                      state={state}
                      selected={e.id}
                      compact
                      onJob={(id) => open({ type: 'job', id })}
                    />
                    <span className="phone-map-label">
                      <Navigation size={12} />
                      Ваш маршрут
                    </span>
                  </div>
                  {e.pausedUntil > state.time && (
                    <div className="phone-break">
                      <Coffee size={16} />
                      Перерыв / недоступен до {time(e.pausedUntil)}
                      <button
                        disabled={busy}
                        onClick={() => act('engineer.pause', { id: e.id, minutes: 0 }, 'Вы снова доступны')}
                      >
                        Вернуться
                      </button>
                    </div>
                  )}
                  {job ? (
                    <div className="next-visit">
                      <div className="next-visit-label">
                        <span>
                          <i />
                          {job.status === 'working'
                            ? 'НА ОБЪЕКТЕ'
                            : job.status === 'enroute'
                              ? 'В ПУТИ'
                              : 'СЛЕДУЮЩИЙ ВЫЕЗД'}
                        </span>
                        <b>#{job.number}</b>
                      </div>
                      <h3>{job.address}</h3>
                      <p>{job.title}</p>
                      <div className="visit-times">
                        <span>
                          <Clock3 size={14} />
                          {time(next.start)}–{time(next.end)}
                        </span>
                        <span className={next.late ? 'late' : ''}>Начать до {time(job.windowEnd)}</span>
                      </div>
                      <div className="phone-tags">
                        {job.equipment.map((k) => (
                          <span key={k}>
                            <Wrench size={11} />
                            {state.catalog.equipment[k]}
                          </span>
                        ))}
                      </div>
                      <Button
                        variant="primary"
                        icon={job.status === 'working' ? Check : ArrowUpRight}
                        disabled={busy}
                        onClick={() =>
                          job.status === 'working'
                            ? act('job.complete', { id: job.id }, 'Работа завершена')
                            : open({ type: 'job', id: job.id })
                        }
                      >
                        {job.status === 'working' ? 'Завершить работу' : 'Открыть заявку'}
                      </Button>
                      <div className="phone-secondary-actions">
                        <button onClick={() => open({ type: 'job', id: job.id })}>
                          <FileText size={14} />
                          Отчёт / проблема
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            act(
                              'engineer.pause',
                              { id: e.id, minutes: 30 },
                              'Перерыв добавлен, план пересчитан',
                            )
                          }
                        >
                          <Coffee size={14} />
                          Перерыв 30 мин
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="phone-empty">
                      <CheckCheck size={35} />
                      <h3>Все выезды позади</h3>
                      <p>Новые назначения появятся здесь.</p>
                    </div>
                  )}
                  <div className="phone-section-label">
                    ДАЛЕЕ ПО МАРШРУТУ <span>{Math.max(0, r.stops.length - 1)}</span>
                  </div>
                  {r.stops.slice(1).map((s, i) => {
                    const j = byId[s.jobId];
                    return (
                      <button
                        className="phone-upcoming"
                        key={j.id}
                        onClick={() => open({ type: 'job', id: j.id })}
                      >
                        <span>{i + 2}</span>
                        <div>
                          <b>{j.address}</b>
                          <small>{j.title}</small>
                        </div>
                        <time>{time(s.start)}</time>
                      </button>
                    );
                  })}
                </>
              ) : tab === 'events' ? (
                <div className="phone-events">
                  <h3>Что нового</h3>
                  {events.map((n) => (
                    <Event key={n.id} event={n} />
                  ))}
                </div>
              ) : (
                <div className="phone-profile">
                  <h3>Моя смена</h3>
                  <p>
                    {time(e.shiftStart)}–{time(e.shiftEnd)} · {transport[e.transport]}
                  </p>
                  <h4>Квалификация</h4>
                  <div className="tags">
                    {e.skills.map((k) => (
                      <Badge key={k} tone="green">
                        {state.catalog.skills[k]}
                      </Badge>
                    ))}
                  </div>
                  <h4>Оборудование</h4>
                  {e.equipment.map((k) => (
                    <p key={k}>
                      <Wrench size={15} /> {state.catalog.equipment[k]}
                    </p>
                  ))}
                  <h4>Моя статистика</h4>
                  <WorkloadSummary metrics={state.plan.engineerMetrics?.find((m) => m.engineerId === e.id)} />
                  <p>
                    {completed.length} выполнено ·{' '}
                    {completed.filter((j) => j.actualStart <= j.windowEnd).length} в срок
                  </p>
                  <Button
                    icon={Coffee}
                    onClick={() =>
                      act('engineer.pause', { id: e.id, minutes: e.pausedUntil > state.time ? 0 : 30 })
                    }
                  >
                    {e.pausedUntil > state.time ? 'Вернуться с перерыва' : 'Перерыв на 30 минут'}
                  </Button>
                </div>
              )}
            </div>
            <nav className="phone-nav">
              {[
                ['route', Route, 'Маршрут'],
                ['events', Bell, 'События'],
                ['profile', Users, 'Профиль'],
              ].map(([key, Icon, title]) => (
                <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                  <Icon size={19} />
                  {title}
                </button>
              ))}
            </nav>
          </div>
          <div className="phone-stage-caption">
            <span className="pulse-dot" />
            Состояние синхронизируется с диспетчером
          </div>
        </div>
        <div className="engineer-context">
          <div className="context-eyebrow">ОДНА КОМАНДА. ОБЩАЯ КАРТИНА.</div>
          <h2>
            Меньше звонков.
            <br />
            Больше ясности.
          </h2>
          <p className="context-intro">
            Инженер знает, куда ехать дальше.
            <br />
            Диспетчер видит, как проходит день.
          </p>
          <section className="panel context-card">
            <div className="panel-heading">
              <h3>Сейчас у {e.name}</h3>
              <Radio size={18} />
            </div>
            <div className="context-facts">
              <WorkloadSummary metrics={state.plan.engineerMetrics?.find((m) => m.engineerId === e.id)} />
              <span>
                Состояние
                <b>
                  {job?.status === 'working'
                    ? 'Работает на объекте'
                    : job?.status === 'enroute'
                      ? 'В пути'
                      : e.pausedUntil > state.time
                        ? 'Перерыв'
                        : 'Ожидает выезда'}
                </b>
              </span>
              <span>
                Ближайший визит<b>{next ? time(next.start) : '—'}</b>
              </span>
              <span>
                Нарушения окон в плане
                <b className={r.stops.some((s) => s.late) ? 'late' : ''}>
                  {r.stops.filter((s) => s.late).length}
                </b>
              </span>
            </div>
          </section>
          <section className="panel context-card">
            <div className="panel-heading">
              <h3>Последние события</h3>
              <span className="live-label">
                <i />
                LIVE
              </span>
            </div>
            <div>
              {events.slice(0, 4).map((n) => (
                <Event key={n.id} event={n} />
              ))}
              {!events.length && <p className="empty-inline">Новых событий пока нет</p>}
            </div>
          </section>
          <div className="context-tip">
            <Sparkles size={20} />
            <p>Добавьте срочную заявку или запланируйте перерыв. Маршрут обновится в обоих режимах.</p>
          </div>
        </div>
      </div>
    </>
  );
}

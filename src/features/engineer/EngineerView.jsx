import EngineerDay from './EngineerDay.jsx';
import { shiftKit } from '../../shared/shift-kit.js';
import React from 'react';
import { Bell, Coffee, Radio, Route, Sparkles, Users, Wifi, Wrench } from 'lucide-react';
import { time, transport } from '../../shared/format.js';
import { Button, Avatar, Badge, Event } from '../../components/ui.jsx';
import { WorkloadSummary } from '../team/Workload.jsx';

export default function EngineerView({ state, engineer: e, setEngineer, tab, setTab, open, act, busy }) {
  const r = state.plan.routes.find((r) => r.engineerId === e.id),
    byId = Object.fromEntries(state.jobs.map((j) => [j.id, j]));
  const next = r.stops[0],
    job = next ? byId[next.jobId] : null,
    completed = state.jobs.filter((j) => j.engineerId === e.id && j.status === 'done');
  const breakUsed = e.breakUsed || (e.breaks || []).length > 0 || e.pausedUntil > 0;
  const events = state.notifications.filter((n) => n.engineerId === e.id || !n.engineerId);
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
              {tab !== 'route' && (
                <div className="phone-heading">
                  <div>
                    <small>Хорошего рабочего дня,</small>
                    <h2>
                      {e.name} <span>✳</span>
                    </h2>
                  </div>
                  <Avatar engineer={e} />
                </div>
              )}
              {tab === 'route' ? (
                <EngineerDay
                  key={`${e.id}:${state.onboardingStage || ''}`}
                  state={state}
                  engineer={e}
                  act={act}
                  busy={busy}
                  open={open}
                />
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
                    disabled={busy || (breakUsed && !(e.pausedUntil > state.time))}
                    onClick={() =>
                      act('engineer.pause', { id: e.id, minutes: e.pausedUntil > state.time ? 0 : 30 })
                    }
                  >
                    {e.pausedUntil > state.time
                      ? 'Вернуться с перерыва'
                      : breakUsed
                        ? 'Перерыв использован'
                        : 'Перерыв на 30 минут'}
                  </Button>
                </div>
              )}
            </div>
            <nav className="phone-nav" aria-label="Навигация инженера">
              {[
                ['route', Route, 'Мой день'],
                ['events', Bell, 'События'],
                ['profile', Users, 'Профиль'],
              ].map(([key, Icon, title]) => (
                <button
                  key={key}
                  className={tab === key ? 'active' : ''}
                  aria-current={tab === key ? 'page' : undefined}
                  onClick={() => setTab(key)}
                >
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
            Меньше звонков. <br />
            Больше ясности.
          </h2>
          <p className="context-intro">
            Инженер знает, куда ехать дальше. <br />
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
                  {!shiftKit(state, e).ready && !['working', 'enroute'].includes(job?.status)
                    ? 'Собирает комплект'
                    : job?.status === 'working'
                      ? 'Работает на объекте'
                      : job?.status === 'enroute'
                        ? 'В пути'
                        : e.pausedUntil > state.time
                          ? 'Перерыв'
                          : 'Ожидает выезда'}
                </b>
              </span>
              <span>
                Комплект на смену
                <b>
                  {shiftKit(state, e).checked} из {shiftKit(state, e).items.length}
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

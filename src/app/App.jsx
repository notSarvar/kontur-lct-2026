import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  CircleHelp,
  Clock3,
  Gauge,
  Headphones,
  LayoutDashboard,
  ListTodo,
  Loader2,
  MapPin,
  Pause,
  Plus,
  RefreshCw,
  Route,
  Search,
  Settings2,
  Smartphone,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { time, statusText } from '../shared/format.js';
import { Button, Modal, Metric, Empty, Event } from '../components/ui.jsx';
import RouteMap from '../components/RouteMap.jsx';
import Timeline from '../components/Timeline.jsx';
import JobsTable from '../features/jobs/JobsTable.jsx';
import JobForm from '../features/jobs/JobForm.jsx';
import JobDetails from '../features/jobs/JobDetails.jsx';
import { SopTemplates } from '../features/jobs/Sop.jsx';
import Analytics from '../features/analytics/Analytics.jsx';
import EngineerView from '../features/engineer/EngineerView.jsx';
import EngineerForm from '../features/team/EngineerForm.jsx';
import ScenarioForm from '../features/scenarios/ScenarioForm.jsx';
import RandomForm from '../features/scenarios/RandomForm.jsx';
import Settings from '../features/scenarios/Settings.jsx';
import DatasetForm from '../features/scenarios/DatasetForm.jsx';
import OfficeForm from '../features/scenarios/OfficeForm.jsx';
import PlanPreview from '../features/plans/PlanPreview.jsx';
import AssignmentForm from '../features/plans/AssignmentForm.jsx';
import GeographyPanel from '../features/scenarios/GeographyPanel.jsx';
import Attention from '../features/jobs/Attention.jsx';
import TeamPlan from '../features/team/TeamPlan.jsx';
import TeamList from '../features/team/TeamList.jsx';
import Availability from '../features/team/Availability.jsx';
import { freeWindows } from '../features/team/availability.js';
import Hackathon from '../features/scenarios/Hackathon.jsx';

export default function App() {
  const [state, setState] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(false);
  const [mode, setMode] = useState('dispatch'),
    [section, setPage] = useState('overview'),
    [selected, setSelected] = useState('all'),
    [mobileEngineer, setMobileEngineer] = useState('eng-1');
  const [modal, setModal] = useState(null),
    [toast, setToast] = useState(null),
    [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(5),
    [phoneTab, setPhoneTab] = useState('route');
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [timeline, setTimeline] = useState(false),
    [focusWindow, setFocusWindow] = useState(null);
  const stateRef = useRef(state),
    busyRef = useRef(false);
  const isHackathon = state?.workspace?.mode === 'hackathon';
  const page = isHackathon ? 'demo' : section;
  useEffect(() => {
    document.title = isHackathon ? 'Контур — пульт хакатона' : 'Контур — маршруты выездной команды';
  }, [isHackathon]);
  stateRef.current = state;
  useEffect(() => setFocusWindow(null), [state?.revision]);
  const accept = (next) => setState((prev) => (!prev || next.revision >= prev.revision ? next : prev));
  const load = async () => {
    try {
      const response = await fetch('/api/state');
      if (!response.ok) throw new Error('Сервер недоступен');
      accept(await response.json());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    const events = new EventSource('/api/events');
    events.onmessage = () => load();
    events.onopen = () => setOnline(true);
    events.onerror = () => setOnline(false);
    return () => events.close();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  async function act(type, payload = {}, message) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const preview = [
        'job.assign',
        'job.save',
        'job.resolve',
        'job.delete',
        'settings',
        'optimize',
        'office.save',
        'geography.confirm',
      ].includes(type);
      const response = await fetch(preview ? '/api/preview' : '/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload, expectedRevision: stateRef.current.revision }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      if (preview) {
        setRunning(false);
        setModal({ type: 'preview', candidate: next });
        return false;
      }
      accept(next);
      if (message) setToast({ text: message });
      return true;
    } catch (e) {
      setToast({ text: e.message, error: true });
      setRunning(false);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function applyPreview() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/preview/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: modal.candidate.id, expectedRevision: modal.candidate.baseRevision }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      accept(next);
      setModal(null);
      setToast({ text: 'Новый план применён' });
    } catch (error) {
      setToast({ text: error.message, error: true });
      await load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function closePreview() {
    fetch(`/api/preview/${modal.candidate.id}`, { method: 'DELETE' }).catch(() => {});
    setModal(null);
  }
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      if (busyRef.current) return;
      const current = stateRef.current;
      if (current.time >= 1440) {
        setRunning(false);
        return;
      }
      act('clock', { time: Math.min(1440, current.time + speed) });
    }, 1400);
    return () => clearInterval(t);
  }, [running, speed]);
  const open = (value) => {
    setRunning(false);
    setModal(value);
  };
  if (!state)
    return (
      <div className="loading-screen">
        <div className="brand-symbol">
          <Route />
        </div>
        <h1>Контур</h1>
        <p>{error || 'Собираем рабочий день…'}</p>
        {error ? <Button onClick={load}>Повторить</Button> : <Loader2 className="spin" />}
      </div>
    );
  const { jobs, engineers, plan, catalog } = state;
  const activeEngineer = engineers.find((e) => e.id === mobileEngineer) || engineers[0];
  const getStop = (id) => plan.routes.flatMap((r) => r.stops).find((s) => s.jobId === id);
  const done = jobs.filter((j) => j.status === 'done'),
    atRisk = jobs.filter(
      (j) =>
        ['blocked', 'manual_review'].includes(j.status) ||
        (j.status === 'pending' && !j.engineerId) ||
        getStop(j.id)?.late > 0,
    );
  const currentJob = modal?.type === 'job' ? jobs.find((j) => j.id === modal.id) : null;
  const openCount = state.support.filter((t) => t.status === 'open').length;
  const freeNow = engineers.filter((e) => freeWindows(state, e).some((w) => w.start === state.time)).length;
  const goJobs = (nextFilter = 'all') => {
    setFilter(nextFilter);
    setSearch('');
    setPage('jobs');
  };
  const visibleJobs = jobs.filter(
    (j) =>
      (filter === 'all' ||
        (filter === 'risk'
          ? atRisk.some((a) => a.id === j.id)
          : filter === 'unassigned'
            ? !j.engineerId && ['pending', 'manual_review'].includes(j.status)
            : j.status === filter)) &&
      `${j.title} ${j.address} ${j.number}`.toLowerCase().includes(search.toLowerCase()),
  );
  const sidebarItems = [
    ['overview', LayoutDashboard, 'Обзор дня'],
    ['jobs', ListTodo, 'Заявки'],
    ['team', Users, 'Команда'],
    ['analytics', Gauge, 'Аналитика'],
    ['support', Headphones, 'Поддержка'],
  ];
  return (
    <div className={`application ${isHackathon ? 'hackathon-workspace' : ''}`}>
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setMode('dispatch');
            setPage('overview');
          }}
        >
          <span className="brand-symbol">
            <Route size={22} />
          </span>
          контур<span className="brand-dot">.</span>
        </a>
        {isHackathon ? (
          <span className="workspace-tag">Хакатон</span>
        ) : (
          <div className="mode-switch" role="tablist" aria-label="Режим приложения">
            <button
              role="tab"
              aria-selected={mode === 'dispatch'}
              className={mode === 'dispatch' ? 'active' : ''}
              onClick={() => setMode('dispatch')}
            >
              <LayoutDashboard size={16} />
              Диспетчер
            </button>
            <button
              role="tab"
              aria-selected={mode === 'engineer'}
              className={mode === 'engineer' ? 'active' : ''}
              onClick={() => setMode('engineer')}
            >
              <Smartphone size={16} />
              Инженер
            </button>
          </div>
        )}
        <div className="top-right">
          {isHackathon && (
            <a
              className="button product-link"
              href={state.workspace.productUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть продукт <ArrowUpRight size={16} />
            </a>
          )}
          <span className={`connection ${online ? '' : 'offline'}`}>
            <i />
            {online ? 'Синхронизировано' : 'Переподключение'}
          </span>
          <button
            className="icon-button"
            aria-label="Уведомления"
            onClick={() => open({ type: 'notifications' })}
          >
            <Bell size={19} />
            <span className="notification-dot" />
          </button>
          <span className="user-avatar">СА</span>
        </div>
      </header>
      <div className="app-body">
        {!isHackathon && (
          <aside className="sidebar">
            <nav>
              {sidebarItems.map(([id, Icon, label]) => (
                <button
                  key={id}
                  className={page === id && mode === 'dispatch' ? 'active' : ''}
                  onClick={() => {
                    setPage(id);
                    setMode('dispatch');
                    if (id === 'jobs') {
                      setFilter('all');
                      setSearch('');
                    }
                  }}
                >
                  <Icon size={18} />
                  {label}
                  {id === 'jobs' && <span className="nav-count">{jobs.length}</span>}
                  {id === 'support' && openCount > 0 && <span className="nav-count alert">{openCount}</span>}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <button onClick={() => open({ type: 'settings' })}>
                <Settings2 size={17} />
                Настройки расчёта
              </button>
              <button onClick={() => open({ type: 'help' })}>
                <CircleHelp size={17} />
                Как это работает
                <ArrowUpRight size={14} />
              </button>
            </div>
          </aside>
        )}
        <main className={`main ${mode === 'engineer' ? 'mobile-mode' : ''}`}>
          {mode === 'dispatch' ? (
            <>
              {!isHackathon && (
                <select
                  className="mobile-workspace-nav"
                  aria-label="Раздел приложения"
                  value={page}
                  onChange={(e) => {
                    if (e.target.value === 'settings') {
                      open({ type: 'settings' });
                      return;
                    }
                    setPage(e.target.value);
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  {sidebarItems.map(([id, , label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                  <option value="settings">Настройки расчёта</option>
                </select>
              )}
              <div className="dispatch-toolbar">
                <div className="day-context">
                  <b>{state.dataset?.name || 'Рабочий день'}</b>
                  <span>{state.dataset?.date || 'Сегодня'}</span>
                  <time>
                    <Clock3 size={14} />
                    {time(state.time)}
                  </time>
                </div>
                {isHackathon && (
                  <div className="hackathon-actions">
                    <Button icon={Settings2} onClick={() => open({ type: 'settings' })}>
                      Настройки расчёта
                    </Button>
                    <Button icon={CircleHelp} onClick={() => open({ type: 'help' })}>
                      Как это работает
                    </Button>
                  </div>
                )}
              </div>
              {page === 'overview' && (
                <>
                  <div className="metrics-grid dispatch-metrics">
                    <Metric
                      icon={ListTodo}
                      label="Заявки на сегодня"
                      value={jobs.length}
                      detail={`${plan.metrics.assigned} в маршрутах`}
                      color="green"
                      onClick={() => goJobs()}
                    />
                    <Metric
                      icon={CheckCheck}
                      label="Выполнено"
                      value={done.length}
                      detail={`из ${jobs.length} заявок`}
                      color="green"
                      onClick={() => goJobs('done')}
                    />
                    <Metric
                      icon={Users}
                      label="Инженеры с выездами"
                      value={
                        <>
                          {plan.metrics.usedEngineers}
                          <span className="metric-total"> / {engineers.length}</span>
                        </>
                      }
                      detail="задействовано / всего в команде"
                      color="green"
                      onClick={() => setPage('team')}
                    />
                  </div>
                  <Attention
                    state={state}
                    jobs={atRisk}
                    onJob={(id) => open({ type: 'job', id })}
                    onAll={() => goJobs('risk')}
                    onGeography={() => open({ type: 'geography' })}
                  />
                  <div className="operations-grid">
                    <section className="panel map-panel">
                      <div className="panel-heading">
                        <h2>{timeline ? 'График выездов' : 'Карта выездов'}</h2>
                        <div className="schedule-view-actions">
                          <div className="small-segment" aria-label="Вид расписания">
                            <button
                              className={!timeline ? 'active' : ''}
                              aria-pressed={!timeline}
                              onClick={() => setTimeline(false)}
                            >
                              <MapPin size={14} />
                              Карта
                            </button>
                            <button
                              className={timeline ? 'active' : ''}
                              aria-pressed={timeline}
                              onClick={() => setTimeline(true)}
                            >
                              <Clock3 size={14} />
                              График
                            </button>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="Пересчитать план"
                            title="Пересчитать план вручную"
                            disabled={busy}
                            onClick={() => act('optimize', {}, 'Маршруты пересчитаны')}
                          >
                            <RefreshCw size={16} className={busy ? 'spin' : ''} />
                          </button>
                        </div>
                      </div>
                      <div className="schedule-toolbar">
                        <select
                          aria-label="Инженер на карте и графике"
                          value={selected}
                          onChange={(e) => {
                            setSelected(e.target.value);
                            setFocusWindow(null);
                          }}
                        >
                          <option value="all">Вся команда · {engineers.length}</option>
                          {engineers.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                        </select>
                        <Button icon={Clock3} onClick={() => open({ type: 'availability' })}>
                          Свободный инженер{' '}
                          <span className="button-count" title="Есть окно от 30 минут прямо сейчас">
                            {freeNow} сейчас
                          </span>
                        </Button>
                      </div>
                      {timeline ? (
                        <Timeline
                          state={state}
                          selected={selected}
                          focusWindow={focusWindow}
                          onJob={(id) => open({ type: 'job', id })}
                        />
                      ) : (
                        <RouteMap
                          state={state}
                          selected={selected}
                          onJob={(id) => open({ type: 'job', id })}
                        />
                      )}
                      <div className="map-footer">
                        <span>
                          <i className="legend-line" />
                          Маршрут <i className="legend-dot" />
                          Объект <i className="legend-square" />
                          Инженер
                        </span>
                        <button className="text-button" onClick={() => open({ type: 'travelInfo' })}>
                          Время в пути: {plan.roadSource === 'prepared' ? 'смешанный расчёт' : 'оценка'}{' '}
                          <CircleHelp size={14} />
                        </button>
                      </div>
                    </section>
                    <TeamPlan
                      state={state}
                      selected={selected}
                      onJob={(id) => open({ type: 'job', id })}
                      onEngineer={(id) => open({ type: 'engineer', id })}
                      onAdd={() => open({ type: 'engineer' })}
                    />
                  </div>
                </>
              )}
              {page === 'jobs' && (
                <section className="panel jobs-panel">
                  <div className="table-toolbar">
                    <div className="search-input">
                      <Search size={17} />
                      <input
                        placeholder="Адрес, номер или тип работ"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Фильтр заявок"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">Все статусы</option>
                      <option value="unassigned">Не назначены</option>
                      <option value="risk">Требуют внимания</option>
                      {Object.entries(statusText).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <Button icon={Plus} variant="primary" onClick={() => open({ type: 'newJob' })}>
                      Новая заявка
                    </Button>
                  </div>
                  <JobsTable
                    jobs={visibleJobs}
                    engineers={engineers}
                    getStop={getStop}
                    onJob={(id) => open({ type: 'job', id })}
                  />
                  {!visibleJobs.length && <Empty text="Заявок с такими параметрами нет" />}
                </section>
              )}
              {page === 'team' && (
                <TeamList
                  state={state}
                  edit={(id) => open({ type: 'engineer', id })}
                  showApp={(id) => {
                    setMobileEngineer(id);
                    setMode('engineer');
                  }}
                />
              )}
              {page === 'analytics' && <Analytics state={state} />}
              {isHackathon && (
                <Hackathon
                  {...{ state, open, act, busy, running, setRunning, speed, setSpeed }}
                  onError={(text) => setToast({ text, error: true })}
                />
              )}
              {page === 'support' && (
                <section className="panel support-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Очередь диспетчера</h2>
                      <p>Конфликты окон и адресов; согласование с клиентом выполняет диспетчер</p>
                    </div>
                    <Button
                      icon={Plus}
                      onClick={() => act('support.create', {}, 'Неназначенные заявки добавлены в очередь')}
                    >
                      Добавить неназначенные
                    </Button>
                  </div>
                  {!state.support.length ? (
                    <Empty text="Обращений пока нет. Инженер может сообщить о проблеме с объекта." />
                  ) : (
                    state.support.map((t) => {
                      const j = jobs.find((j) => j.id === t.jobId);
                      return (
                        <div className="support-ticket" key={t.id}>
                          <span className={`ticket-icon ${t.status === 'resolved' ? 'resolved' : ''}`}>
                            {t.status === 'resolved' ? <Check size={20} /> : <Headphones size={20} />}
                          </span>
                          <div>
                            <h3>
                              №{j?.number} · {j?.address}
                            </h3>
                            <p>{t.text}</p>
                            <small>
                              {time(t.time)} · {t.status === 'open' ? 'Ожидает решения' : 'Обработано'}
                            </small>
                          </div>
                          {t.status === 'open' && (
                            <Button
                              onClick={() =>
                                t.kind === 'scheduling'
                                  ? open({ type: 'resolveJob', id: t.jobId })
                                  : act('support.resolve', { id: t.id }, 'Обращение обработано')
                              }
                            >
                              {t.kind === 'scheduling' ? 'Согласовать заявку' : 'Вернуть в планирование'}
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                </section>
              )}
            </>
          ) : (
            <EngineerView
              state={state}
              engineer={activeEngineer}
              setEngineer={setMobileEngineer}
              tab={phoneTab}
              setTab={setPhoneTab}
              open={open}
              act={act}
              busy={busy}
            />
          )}
          <footer className="page-footer">
            <span>
              {busy ? (
                <>
                  <Loader2 size={12} className="spin" />
                  Считаем расписание…
                </>
              ) : (
                <>План обновлён в {time(plan.at)}</>
              )}
            </span>
            {running && (
              <button className="text-button" onClick={() => setRunning(false)}>
                <Pause size={13} />
                Остановить симуляцию
              </button>
            )}
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className={`toast ${toast.error ? 'error' : ''}`}>
          {toast.error ? <TriangleAlert size={18} /> : <CheckCheck size={18} />}
          <span>{toast.text}</span>
          <button aria-label="Скрыть уведомление" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {(modal?.type === 'newJob' || modal?.type === 'editJob' || modal?.type === 'resolveJob') && (
        <JobForm
          job={['editJob', 'resolveJob'].includes(modal.type) ? jobs.find((j) => j.id === modal.id) : null}
          state={state}
          urgent={modal.urgent}
          onClose={() => setModal(null)}
          save={async (p) => {
            if (
              await act(
                modal.type === 'resolveJob' ? 'job.resolve' : 'job.save',
                p,
                'Заявка сохранена, расписание обновлено',
              )
            )
              setModal(null);
          }}
          busy={busy}
        />
      )}
      {currentJob && (
        <JobDetails
          job={currentJob}
          state={state}
          onClose={() => setModal(null)}
          edit={() =>
            open({
              type: currentJob.status === 'manual_review' ? 'resolveJob' : 'editJob',
              id: currentJob.id,
            })
          }
          act={act}
          assign={() => open({ type: 'assignment', id: currentJob.id })}
          busy={busy}
          demo={isHackathon}
        />
      )}
      {modal?.type === 'availability' && (
        <Availability
          state={state}
          onClose={() => setModal(null)}
          onSelect={(id, window) => {
            setSelected(id);
            setFocusWindow(window);
            setTimeline(true);
            setPage('overview');
            setMode('dispatch');
            setModal(null);
          }}
        />
      )}
      {modal?.type === 'travelInfo' && (
        <Modal title="Как рассчитано время в пути" onClose={() => setModal(null)}>
          <div className="modal-body form-stack">
            <p>{plan.roadDetail}</p>
            <p>
              Общественный транспорт пока рассчитывается без расписаний и пересадок. Учитывайте эту
              погрешность при согласовании времени с клиентом.
            </p>
            <Button onClick={() => open({ type: 'settings' })}>Настройки расчёта</Button>
          </div>
        </Modal>
      )}
      {modal?.type === 'assignment' && (
        <AssignmentForm
          job={jobs.find((j) => j.id === modal.id)}
          state={state}
          busy={busy}
          onClose={() => setModal(null)}
          save={(payload) => act('job.assign', payload)}
        />
      )}
      {modal?.type === 'geography' && (
        <GeographyPanel
          state={state}
          busy={busy}
          onClose={() => setModal(null)}
          office={() => open({ type: 'office' })}
          save={(payload) => act('geography.confirm', payload)}
        />
      )}
      {modal?.type === 'preview' && (
        <PlanPreview
          candidate={modal.candidate}
          revision={state.revision}
          busy={busy}
          apply={applyPreview}
          onClose={closePreview}
        />
      )}
      {modal?.type === 'engineer' && (
        <EngineerForm
          engineer={
            engineers.find((e) => e.id === modal.id) || {
              name: `Инженер ${engineers.length + 1}`,
              skills: ['local'],
              equipment: [],
              transport: 'transit',
              shiftStart: 480,
              shiftEnd: 1380,
              home: { ...engineers[0].home },
            }
          }
          catalog={catalog}
          onClose={() => setModal(null)}
          save={async (p) => {
            if (await act('engineer.save', p, 'Ресурсы сохранены')) setModal(null);
          }}
          busy={busy}
        />
      )}
      {modal?.type === 'dataset' && (
        <DatasetForm
          busy={busy}
          onClose={() => setModal(null)}
          save={async (id) => {
            if (await act('dataset.load', { id }, 'Синтетические данные загружены')) {
              setSelected('all');
              setModal(null);
            }
          }}
        />
      )}
      {modal?.type === 'office' && (
        <OfficeForm
          state={state}
          busy={busy}
          onClose={() => setModal(null)}
          save={async (p) => {
            if (await act('office.save', p, 'Координаты офиса подтверждены')) setModal(null);
          }}
        />
      )}
      {modal?.type === 'random' && (
        <RandomForm
          state={state}
          busy={busy}
          onClose={() => setModal(null)}
          save={async (p) => {
            if (await act('jobs.random', p, 'Новые заявки добавлены, расписание пересчитано')) setModal(null);
          }}
        />
      )}
      {modal?.type === 'generate' && (
        <ScenarioForm
          state={state}
          busy={busy}
          onClose={() => setModal(null)}
          save={async (p) => {
            if (await act('generate', p, 'Новый день готов')) {
              setSelected('all');
              setModal(null);
            }
          }}
        />
      )}
      {modal?.type === 'settings' && (
        <Settings
          state={state}
          onTemplates={() => setModal({ type: 'sopTemplates' })}
          busy={busy}
          onClose={() => setModal(null)}
          save={async (p) => {
            if (await act('settings', p, 'Настройки применены')) setModal(null);
          }}
        />
      )}
      {modal?.type === 'sopTemplates' && (
        <SopTemplates state={state} busy={busy} act={act} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'notifications' && (
        <Modal
          title="События рабочего дня"
          subtitle="Действия инженеров и изменения расписания"
          onClose={() => setModal(null)}
        >
          <div className="event-list">
            {state.notifications.map((e) => (
              <Event key={e.id} event={e} />
            ))}
            {!state.notifications.length && <Empty text="Событий пока нет" />}
          </div>
        </Modal>
      )}
      {modal?.type === 'import' && (
        <Modal
          title="Загрузить сценарий?"
          subtitle="Текущий день, отчёты и история будут заменены. Время вернётся к 08:00."
          onClose={() => setModal(null)}
        >
          <div className="modal-body">
            <p>
              В файле: {modal.data.jobs?.length || 0} заявок и {modal.data.engineers?.length || 0} инженеров.
              Все ограничения будут проверены перед импортом.
            </p>
            <div className="form-actions">
              <Button onClick={() => setModal(null)}>Отмена</Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  if (await act('import', modal.data, 'Сценарий загружен')) {
                    setSelected('all');
                    setModal(null);
                  }
                }}
              >
                Заменить сценарий
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'help' && (
        <Modal
          title="Рабочий прототип, открытая модель"
          subtitle="Что можно проверить в этой лаборатории"
          onClose={() => setModal(null)}
        >
          <div className="modal-body help-copy">
            <p>
              Все назначения, маршруты, сроки и метрики рассчитываются заново по входным данным. Начальные
              заявки синтетические, координаты — точки в Москве. Вы можете вводить свои данные, выбирать точку
              на карте и импортировать JSON.
            </p>
            <h3>Ограничения</h3>
            <p>
              Квалификация, оборудование, вид транспорта, конец смены и окно <b>начала визита</b> —
              обязательны. Клиентское окно ограничивает начало работы. Если визит не помещается, диспетчер
              согласует новое окно; система не меняет его автоматически. Оборудование закреплено за инженером,
              обмен и общий склад не моделируются.
            </p>
            <h3>Как считается план</h3>
            <p>
              {plan.algorithm} Сначала алгоритм стремится разместить больше заявок с учётом срочности, затем
              быстрее выполнить аварии, уменьшить число исполнителей и километраж. Базовый алгоритм сравнения
              использует те же ограничения.
            </p>
            <h3>Карта и переезды</h3>
            <p>
              {plan.roadDetail} Сплошные линии следуют дорожной геометрии; пунктир соединяет точки схематично.
              Положение инженера в симуляции интерполируется между объектами и не является GPS-треком.
              Обратный путь на базу не входит в смену.
            </p>
            <h3>Симуляция и сохранение</h3>
            <p>
              Время движется только вперёд: выезды и работы выполняются автоматически по плану. Для повтора
              создайте новый сценарий с тем же seed. Заметки, обращения и завершения сохраняются на сервере и
              синхронизируются между вкладками. История точности учитывает только завершённые в этом сценарии
              работы.
            </p>
            <p>
              Локальный MVP без авторизации и внешних push-уведомлений. Лента событий работает при открытом
              приложении. Платные API и языковые модели не используются.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

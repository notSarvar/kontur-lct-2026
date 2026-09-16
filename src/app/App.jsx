import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowUpFromLine,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coffee,
  Download,
  Gauge,
  Headphones,
  Layers3,
  LayoutDashboard,
  ListTodo,
  Loader2,
  MapPin,
  Navigation,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
  TriangleAlert,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { time, duration, transport, statusText } from '../shared/format.js';
import { Button, Avatar, Badge, Modal, Metric, Empty, Event } from '../components/ui.jsx';
import RouteMap from '../components/RouteMap.jsx';
import Timeline from '../components/Timeline.jsx';
import JobsTable from '../features/jobs/JobsTable.jsx';
import JobForm from '../features/jobs/JobForm.jsx';
import JobDetails from '../features/jobs/JobDetails.jsx';
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

export default function App() {
  const [state, setState] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(false);
  const [mode, setMode] = useState('dispatch'),
    [page, setPage] = useState('overview'),
    [selected, setSelected] = useState('all'),
    [mobileEngineer, setMobileEngineer] = useState('eng-1');
  const [modal, setModal] = useState(null),
    [toast, setToast] = useState(null),
    [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(5),
    [phoneTab, setPhoneTab] = useState('route');
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [timeline, setTimeline] = useState(false);
  const stateRef = useRef(state),
    busyRef = useRef(false),
    fileRef = useRef();
  stateRef.current = state;
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
  const routes = plan.routes.filter((r) => selected === 'all' || r.engineerId === selected);
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
  const exportFile = async () => {
    const response = await fetch('/api/export');
    const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kontur-scenario-${state.seed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const urgent = () => open({ type: 'newJob', urgent: true });
  const sidebarItems = [
    ['overview', LayoutDashboard, 'Обзор дня'],
    ['jobs', ListTodo, 'Заявки'],
    ['team', Users, 'Команда'],
    ['analytics', Gauge, 'Аналитика'],
    ['support', Headphones, 'Поддержка'],
  ];
  return (
    <div className="application">
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
        <div className="top-right">
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
        <aside className="sidebar">
          <div className="workspace">
            <span className="workspace-icon">
              <Layers3 size={18} />
            </span>
            <div>
              Выездная служба<small>Лаборатория маршрутов</small>
            </div>
          </div>
          <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
          <nav>
            {sidebarItems.map(([id, Icon, label]) => (
              <button
                key={id}
                className={page === id && mode === 'dispatch' ? 'active' : ''}
                onClick={() => {
                  setPage(id);
                  setMode('dispatch');
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
            <div className="scenario-label">
              <span className="pulse-dot" />
              {state.dataset ? `Участок: ${state.dataset.name}` : 'Учебный сценарий'}
              <small>
                {state.dataset ? `${state.dataset.date} · штат синтетический` : `Заявки · seed ${state.seed}`}
              </small>
            </div>
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
        <main className={`main ${mode === 'engineer' ? 'mobile-mode' : ''}`}>
          {mode === 'dispatch' ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span />
                    ОПЕРАТИВНОЕ УПРАВЛЕНИЕ <span className="eyebrow-sep">/</span> МОСКВА
                  </div>
                  <h1>
                    {
                      {
                        overview: 'Рабочий день под контролем',
                        jobs: 'Каждая заявка на своём месте',
                        team: 'Люди, на которых всё держится',
                        analytics: 'Результат в цифрах',
                        support: 'Помощь там, где она нужна',
                      }[page]
                    }
                  </h1>
                  <p>Планируйте выезды, следите за командой и реагируйте на изменения.</p>
                </div>
                <div className="heading-actions">
                  <select
                    aria-label="Режим планирования"
                    disabled={busy}
                    value={state.settings.mode || 'economy'}
                    onChange={(event) => act('settings', { ...state.settings, mode: event.target.value })}
                  >
                    <option value="economy">Экономия</option>
                    <option value="emergency">Аварийное реагирование</option>
                  </select>
                  <Button
                    icon={RefreshCw}
                    disabled={busy}
                    onClick={() => act('optimize', {}, 'Маршруты пересчитаны')}
                  >
                    Пересчитать
                  </Button>
                  <Button icon={Plus} variant="primary" onClick={() => open({ type: 'newJob' })}>
                    Новая заявка
                  </Button>
                </div>
              </div>
              {state.dataset && (
                <div className="dataset-banner">
                  <span>
                    <b>{state.dataset.name}</b> · {state.dataset.date} · {jobs.length} заявок ·{' '}
                    {engineers.length} синтетических инженеров. Общественный транспорт: оценка, без
                    расписаний. {state.dataset.office.approximate && 'Точка офиса предварительная.'}
                  </span>
                  <Button onClick={() => open({ type: 'office' })}>Офис участка</Button>
                  <Button onClick={() => open({ type: 'geography' })}>
                    География: {state.geography?.issues.length || 0} на проверке
                  </Button>
                </div>
              )}
              <div className="metrics-grid">
                <Metric
                  icon={ListTodo}
                  label="Заявки на сегодня"
                  value={jobs.length}
                  detail={`${plan.metrics.assigned} в маршрутах · ${done.length} выполнено`}
                  color="green"
                />
                <Metric
                  icon={Users}
                  label="Задействовано инженеров"
                  value={plan.metrics.usedEngineers}
                  detail={`из ${engineers.length} в команде`}
                  color="purple"
                />
                <Metric
                  icon={Navigation}
                  label="Длина маршрутов"
                  value={`${plan.metrics.km.toFixed(1)} км`}
                  detail={`${duration(plan.metrics.travel)} в пути · ${plan.roadSource === 'osrm' ? 'по дорогам' : plan.roadSource === 'prepared' ? 'пешком по дорогам, ОТ оценочно' : 'оценка'}`}
                  color="blue"
                />
                <Metric
                  icon={ShieldCheck}
                  label="Требуют внимания"
                  value={atRisk.length}
                  detail={
                    atRisk.length
                      ? 'Согласование времени, адреса или помощь'
                      : 'Все текущие назначения в срок'
                  }
                  color={atRisk.length ? 'orange' : 'green'}
                />
              </div>
              {page === 'overview' && (
                <>
                  <div className="operations-grid">
                    <section className="panel map-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            Карта выездов{' '}
                            <span className="live-label">
                              <i />
                              LIVE
                            </span>
                          </h2>
                          <p>Маршруты команды и точки обслуживания</p>
                        </div>
                        <div className="small-segment">
                          <button className={!timeline ? 'active' : ''} onClick={() => setTimeline(false)}>
                            <MapPin size={14} />
                            Карта
                          </button>
                          <button className={timeline ? 'active' : ''} onClick={() => setTimeline(true)}>
                            <Clock3 size={14} />
                            График
                          </button>
                        </div>
                      </div>
                      <div className="engineer-filters">
                        <button
                          className={selected === 'all' ? 'selected' : ''}
                          onClick={() => setSelected('all')}
                        >
                          Вся команда <span>{engineers.length}</span>
                        </button>
                        {engineers.map((e) => (
                          <button
                            key={e.id}
                            className={selected === e.id ? 'selected' : ''}
                            onClick={() => setSelected(e.id)}
                          >
                            <i style={{ background: e.color }} />
                            {e.name}
                          </button>
                        ))}
                      </div>
                      {timeline ? (
                        <Timeline
                          state={state}
                          selected={selected}
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
                        <span title={plan.roadDetail}>
                          {plan.roadSource === 'osrm'
                            ? 'OSRM · дороги'
                            : plan.roadSource === 'prepared'
                              ? 'Пешком по дорогам · ОТ оценочно'
                              : plan.roadSource === 'mixed'
                                ? 'Дороги + оценка'
                                : plan.roadSource === 'fallback'
                                  ? 'OSRM недоступен · оценка'
                                  : 'Оценочное время'}
                          <CircleHelp size={13} />
                        </span>
                      </div>
                    </section>
                    <section className="panel route-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>План команды</h2>
                          <p>Оставшиеся визиты на сегодня</p>
                        </div>
                        <span className="count-circle">{plan.metrics.assigned}</span>
                      </div>
                      <div className="route-list">
                        {routes.map((route) => {
                          const e = engineers.find((x) => x.id === route.engineerId);
                          return (
                            <div className="engineer-route" key={e.id}>
                              <button
                                className="route-person"
                                onClick={() => {
                                  setMobileEngineer(e.id);
                                  setMode('engineer');
                                }}
                              >
                                <Avatar engineer={e} />
                                <span>
                                  <b>{e.name}</b>
                                  <small>
                                    {route.stops.length} выездов · {duration(route.drive)} в пути ·{' '}
                                    {route.totalKm.toFixed(1)} км
                                  </small>
                                </span>
                                <ChevronRight size={16} />
                              </button>
                              {e.pausedUntil > state.time && (
                                <div className="break-label">
                                  <Coffee size={13} />
                                  Перерыв / недоступен до {time(e.pausedUntil)}
                                </div>
                              )}
                              <div className="route-stops">
                                {route.stops.slice(0, selected === 'all' ? 2 : 8).map((s, i) => {
                                  const j = jobs.find((j) => j.id === s.jobId);
                                  return (
                                    <button
                                      className="route-stop"
                                      key={j.id}
                                      onClick={() => open({ type: 'job', id: j.id })}
                                    >
                                      <span className="stop-number" style={{ '--person': e.color }}>
                                        {i + 1}
                                      </span>
                                      <span>
                                        <b>{j.address}</b>
                                        <small>
                                          {j.title}
                                          {j.priority === 'urgent' ? ' · срочно' : ''}
                                        </small>
                                      </span>
                                      <time className={s.late ? 'late' : ''}>{time(s.start)}</time>
                                    </button>
                                  );
                                })}
                                {!route.stops.length && (
                                  <p className="empty-inline">Нет запланированных выездов</p>
                                )}
                                {selected === 'all' && route.stops.length > 2 && (
                                  <button className="more-stops" onClick={() => setSelected(e.id)}>
                                    Ещё {route.stops.length - 2} выезда <ArrowRight size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="route-panel-footer">
                        <ShieldCheck size={15} />
                        Ресурсы и окна проверены алгоритмом
                      </div>
                    </section>
                  </div>
                  <section className="panel attention-panel">
                    <div className="attention-icon">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h3>
                        {atRisk.length
                          ? `${atRisk.length} заявок требуют решения`
                          : 'Можно двигаться по плану'}
                      </h3>
                      <p>
                        {atRisk.length
                          ? 'Проверьте ограничения, сроки и обращения с объектов.'
                          : 'Добавьте срочную заявку и посмотрите, как команда адаптируется к изменениям.'}
                      </p>
                    </div>
                    <Button
                      icon={atRisk.length ? ArrowRight : Zap}
                      onClick={() => (atRisk.length ? (setPage('jobs'), setFilter('risk')) : urgent())}
                    >
                      {atRisk.length ? 'Проверить заявки' : 'Проверить срочный выезд'}
                    </Button>
                  </section>
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
                    <Button icon={Download} onClick={exportFile}>
                      Экспорт JSON
                    </Button>
                    <Button icon={ArrowUpFromLine} onClick={() => fileRef.current.click()}>
                      Импорт
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".json"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files[0];
                        if (f)
                          try {
                            open({ type: 'import', data: JSON.parse(await f.text()) });
                          } catch {
                            setToast({ text: 'Не удалось прочитать JSON', error: true });
                          }
                        e.target.value = '';
                      }}
                    />
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
                <div className="team-grid">
                  <Button icon={Plus} onClick={() => open({ type: 'engineer' })}>
                    Добавить инженера
                  </Button>
                  {engineers.map((e) => {
                    const route = plan.routes.find((r) => r.engineerId === e.id);
                    return (
                      <section className="panel team-card" key={e.id}>
                        <div className="team-card-header">
                          <Avatar engineer={e} size="large" />
                          <span>
                            <h2>{e.name}</h2>
                            <p>
                              {transport[e.transport]} · {time(e.shiftStart)}–{time(e.shiftEnd)}
                            </p>
                          </span>
                        </div>
                        <div className="tags">
                          {e.skills.map((k) => (
                            <Badge key={k} tone="green">
                              {catalog.skills[k]}
                            </Badge>
                          ))}
                        </div>
                        <div className="equipment-list">
                          {e.equipment.map((k) => (
                            <span key={k}>
                              <Wrench size={13} />
                              {catalog.equipment[k]}
                            </span>
                          ))}
                        </div>
                        <div className="team-numbers">
                          <span>
                            <b>{route.stops.length}</b>выездов
                          </span>
                          <span>
                            <b>{duration(route.work)}</b>работы
                          </span>
                          <span>
                            <b>{route.totalKm.toFixed(1)} км</b>оценка пути
                          </span>
                        </div>
                        <div className="team-card-footer">
                          <Button icon={Settings2} onClick={() => open({ type: 'engineer', id: e.id })}>
                            Ресурсы
                          </Button>
                          <Button
                            icon={Smartphone}
                            onClick={() => {
                              setMobileEngineer(e.id);
                              setMode('engineer');
                            }}
                          >
                            Открыть приложение
                          </Button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
              {page === 'analytics' && <Analytics state={state} />}
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
          <section className="simulation">
            <div className="simulation-top">
              <div className="simulation-title">
                <span className="simulation-icon">
                  <SlidersHorizontal size={19} />
                </span>
                <div>
                  <h3>Лаборатория рабочего дня</h3>
                  <p>Время симуляции · передвижение и выполнение заявок</p>
                </div>
              </div>
              <div className="simulation-actions">
                <Button icon={Layers3} onClick={() => open({ type: 'dataset' })}>
                  Данные Билайн
                </Button>
                <Button icon={Plus} onClick={() => open({ type: 'random' })}>
                  Случайные заявки
                </Button>
                <Button icon={Shuffle} onClick={() => open({ type: 'generate' })}>
                  Новый сценарий
                </Button>
                <Button icon={Zap} onClick={urgent}>
                  Срочная заявка
                </Button>
              </div>
            </div>
            <div className="simulation-controls">
              <button
                className={`play-button ${running ? 'playing' : ''}`}
                aria-label={running ? 'Пауза симуляции' : 'Запустить симуляцию'}
                onClick={() => setRunning(!running)}
                disabled={state.time >= 1440}
              >
                {running ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <div className="simulation-clock">
                {time(state.time)}
                <small>{running ? 'Симуляция идёт' : 'На паузе'}</small>
              </div>
              <div className="slider-wrap">
                <input
                  aria-label="Время рабочего дня"
                  type="range"
                  min="480"
                  max="1440"
                  step="5"
                  value={state.time}
                  disabled={busy}
                  style={{ '--progress': `${((state.time - 480) / 960) * 100}%` }}
                  onChange={(e) => {
                    setRunning(false);
                    act('clock', { time: Number(e.target.value) });
                  }}
                />
                <div className="slider-labels">
                  <span>08:00</span>
                  <span>12:00</span>
                  <span>16:00</span>
                  <span>20:00</span>
                  <span>24:00</span>
                </div>
              </div>
              <select
                aria-label="Скорость симуляции"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value="1">1 мин / шаг</option>
                <option value="5">5 мин / шаг</option>
                <option value="15">15 мин / шаг</option>
              </select>
              <Button
                onClick={() => act('clock', { time: Math.min(1440, state.time + 30) })}
                disabled={busy || state.time >= 1440}
              >
                +30 мин
              </Button>
            </div>
          </section>
          <footer className="page-footer">
            <span>
              КОНТУР <i /> Планирование с учётом реальности
            </span>
            <span>
              {busy ? (
                <>
                  <Loader2 size={12} className="spin" />
                  Считаем расписание…
                </>
              ) : (
                <>
                  Расчёт {plan.metrics.computeMs} мс · обновлено в {time(plan.at)}
                </>
              )}
            </span>
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
        />
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
          busy={busy}
          onClose={() => setModal(null)}
          save={async (p) => {
            if (await act('settings', p, 'Настройки применены')) setModal(null);
          }}
        />
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

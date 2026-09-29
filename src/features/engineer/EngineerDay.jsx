import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, Info, Phone } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import RouteMap from '../../components/RouteMap.jsx';
import { time, duration } from '../../shared/format.js';
import { shiftKit, sopReady } from '../../shared/shift-kit.js';
import './engineer-day.css';
import { openKitShortage } from '../../shared/kit-shortage.js';
import ClientPhone, { DEMO_CLIENT_PHONE } from './ClientPhone.jsx';

function WorkTimer({ job, minute }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [job.id]);
  const timer = job.workTimer;
  const seconds =
    timer?.durationSeconds ??
    (timer?.source === 'manual'
      ? Math.max(0, Math.floor((now - timer.startedAt) / 1000))
      : Math.max(0, Math.round((minute - job.actualStart) * 60)));
  const display = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  return (
    <div className="engineer-work-timer">
      <span>Время работы на объекте</span>
      <strong role="timer" aria-label="Время работы на объекте">
        {display}
      </strong>
      <small>
        Норматив: {job.duration} мин{timer?.source === 'manual' ? ' · Фактическое время' : ''}
      </small>
    </div>
  );
}
function Notice({ tone = 'info', title, children }) {
  const Icon = tone === 'success' ? Check : tone === 'warning' ? CircleAlert : Info;
  return (
    <div className={`engineer-notice ${tone}`} role="status">
      <Icon size={15} />
      <div>
        <b>{title}</b>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}
function JobCard({ job, stop, details = true, onOpen, children }) {
  return (
    <div className="engineer-job-card">
      <div className="engineer-job-number">
        <b>№{job.number}</b>
        {stop && <strong>{time(stop.start)}</strong>}
      </div>
      <h3>
        {onOpen ? (
          <button className="engineer-job-open" aria-label="Открыть заявку" onClick={onOpen}>
            {job.address}
          </button>
        ) : (
          job.address
        )}
      </h3>
      <p>{job.title}</p>
      {children}
      {details && (
        <div className="engineer-job-times">
          <span>
            Окно клиента
            <strong>
              {time(job.windowStart)}–{time(job.windowEnd)}
            </strong>
          </span>
          <span>
            Работа<strong>{job.duration} мин</strong>
          </span>
        </div>
      )}
    </div>
  );
}
function CheckRow({ checked, disabled, onChange, children, detail, quantity }) {
  return (
    <label className={`engineer-check ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span>
        <b>{children}</b>
        {detail && <small>{detail}</small>}
      </span>
      {quantity && <strong>{quantity}</strong>}
    </label>
  );
}
export default function EngineerDay({ state, engineer: e, act, busy, open }) {
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [problem, setProblem] = useState('');
  const showDetails = (id) => {
    setDetailId(id);
    setScreen('details');
  };
  const [screen, setScreen] = useState('visit');
  const [outcome, setOutcome] = useState(null);
  const [comment, setComment] = useState('');
  const [closedId, setClosedId] = useState(null);
  const root = useRef(null);
  const route = state.plan.routes.find((r) => r.engineerId === e.id);
  const stops = route?.stops || [];
  const byId = Object.fromEntries(state.jobs.map((j) => [j.id, j]));
  const stop = stops[0];
  const current = byId[stop?.jobId];
  const closed = byId[closedId]?.visitResult ? byId[closedId] : null;
  const job = screen === 'closed' && closed ? closed : current;
  const kit = shiftKit(state, e);
  const shortage = openKitShortage(state, e.id);
  const missing = kit.items.filter((item) => !item.done);
  const automatic = state.settings.autoChecklists !== false;
  const collecting = !kit.ready && !['working', 'enroute'].includes(current?.status);
  const view = screen === 'kit' || collecting ? 'kit' : screen === 'closed' && !closed ? 'visit' : screen;
  const active = current?.status === 'working' || current?.status === 'enroute';
  const arrived = current?.status === 'enroute' && current.arrivedAt != null;
  const early = arrived && state.time < current.windowStart;
  const done = state.jobs.filter((j) => j.engineerId === e.id && j.status === 'done').length;
  const send = (type, payload = {}, message) =>
    act(type, { ...payload, expectedRevision: state.revision }, message);
  const check = (payload) => send('job.sop.check', { id: current.id, ...payload });
  useEffect(() => {
    root.current?.closest('.phone-content')?.scrollTo(0, 0);
  }, [view, current?.id, current?.status, arrived]);
  useEffect(() => {
    setScreen((previous) => (previous === 'closed' ? previous : 'visit'));
    setComment('');
    setOutcome(null);
    setConfirmMissing(false);
  }, [current?.id, state.createdAt]);
  const detail = byId[detailId] || current;
  const titles = {
    details: 'О заявке',
    issue: 'Сообщить о проблеме',
    kit: 'Сбор на смену',
    order: 'Порядок дня',
    map: 'Маршрут',
    contact: 'Контакт клиента',
    call: 'Звонок клиенту',
    result: 'Результат визита',
    confirm:
      outcome === 'complete'
        ? 'Всё выполнено'
        : outcome === 'partial'
          ? 'Выполнено частично'
          : 'Не удалось выполнить',
    closed: 'Визит закрыт',
  };
  const title =
    titles[view] ||
    (current?.status === 'working'
      ? 'Работа на объекте'
      : early
        ? 'Раннее прибытие'
        : arrived
          ? 'На объекте'
          : active
            ? 'В пути'
            : current
              ? 'Ближайшая работа'
              : 'Все выезды позади');
  const back = () => setScreen('visit');
  const issue = (
    <Button
      disabled={busy}
      onClick={() => {
        setProblem('');
        setScreen('issue');
      }}
    >
      Сообщить о проблеме
    </Button>
  );
  const miniMap = (
    <div className="phone-map engineer-visit-map">
      <RouteMap
        state={state}
        selected={e.id}
        currentJobId={current?.id}
        compact
        onJob={() => setScreen('contact')}
      />
    </div>
  );
  return (
    <div className="engineer-day" ref={root}>
      <header className="engineer-day-heading">
        <div>
          {view !== 'visit' && !collecting && (
            <button aria-label="Назад к визиту" onClick={back}>
              <ArrowLeft size={17} />
            </button>
          )}
          <h2>{title}</h2>
        </div>
        <small>Рабочий день</small>
        <span className="engineer-plan-badge">План · {time(state.plan.at ?? state.time)}</span>
      </header>
      <div className="engineer-simulation-mode">
        <span>{automatic ? 'Симуляция дня · чек-листы заполнены' : 'Ручное прохождение · весь день'}</span>
        <button disabled={busy} onClick={() => send('simulation.checklists', { enabled: !automatic })}>
          {automatic ? 'Пройти вручную' : 'Автозаполнение'}
        </button>
      </div>
      {e.shiftWithdrawn ? (
        <Notice tone="warning" title="Вы сняты со смены">
          Диспетчер пересчитал оставшиеся работы. Новые выезды недоступны.
        </Notice>
      ) : shortage ? (
        <Notice tone="warning" title="Маршрут под риском — ожидайте решения">
          Недостача отправлена диспетчеру: {shortage.missing.map((item) => item.label).join(', ')}. Новые
          выезды приостановлены.
        </Notice>
      ) : view === 'details' && detail ? (
        <>
          <JobCard job={detail} />
          <ClientPhone key={detail.id} />
          <h3 className="engineer-section-title">Условия доступа</h3>
          <p>{detail.access || 'Уточните условия доступа у клиента.'}</p>
          <h3 className="engineer-section-title">Регламент работ</h3>
          {detail.sop ? (
            <>
              <p>{detail.sop.title}</p>
              <p className="engineer-muted">{detail.sop.prerequisites}</p>
              <ol>
                {detail.sop.steps.map((step) => (
                  <li key={step.id}>{step.text}</li>
                ))}
              </ol>
            </>
          ) : (
            <p className="engineer-muted">SOP не выбран. Уточните порядок работ у диспетчера.</p>
          )}
          <div className="engineer-actions">
            <Button onClick={back}>Вернуться к визиту</Button>
          </div>
        </>
      ) : view === 'issue' && current ? (
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await send(
                'job.issue',
                { id: current.id, text: problem.trim() },
                'Проблема передана диспетчеру',
              )
            ) {
              setProblem('');
              back();
            }
          }}
        >
          <JobCard job={current} details={false} />
          <Notice tone="warning" title="Помощь диспетчера">
            Заявка будет приостановлена и передана в поддержку. Опишите, что мешает продолжить работу.
          </Notice>
          <label>
            Что случилось?
            <textarea
              aria-label="Описание проблемы"
              value={problem}
              maxLength={2000}
              required
              rows={5}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="Например, нет доступа на объект"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 8 }}
            />
          </label>
          <div className="engineer-actions">
            <Button type="submit" variant="primary" disabled={busy || !problem.trim()}>
              Отправить диспетчеру
            </Button>
            <Button type="button" disabled={busy} onClick={back}>
              Отмена
            </Button>
          </div>
        </form>
      ) : view === 'kit' ? (
        <>
          <Notice
            tone={kit.ready ? 'success' : 'warning'}
            title={`Отмечено ${kit.checked} из ${kit.items.length}`}
          >
            {kit.ready
              ? 'Комплект собран. Можно переходить к выездам.'
              : 'Отметьте оборудование и материалы, которые взяли. Пока комплект не собран, выезд недоступен.'}
          </Notice>
          {['materials', 'tools'].map((kind) => (
            <section key={kind}>
              <h3 className="engineer-section-title">
                {kind === 'materials' ? 'Материалы на день' : 'Инструменты на смену'}
              </h3>
              {kit.items
                .filter((i) => i.kind === kind)
                .map((item) => (
                  <CheckRow
                    key={item.key}
                    checked={item.done}
                    disabled={busy || automatic}
                    quantity={item.quantity}
                    detail={`${item.sources.join(' · ')}${item.detail ? ` · ${item.detail}` : ''}`}
                    onChange={(event) =>
                      send('engineer.kit.check', { id: e.id, key: item.key, done: event.target.checked })
                    }
                  >
                    {item.label}
                  </CheckRow>
                ))}
            </section>
          ))}
          {kit.uncovered > 0 && (
            <p className="engineer-muted">
              Для {kit.uncovered} заявок SOP не выбран. Комплект этих работ уточните у диспетчера.
            </p>
          )}
          <div className="engineer-actions">
            {confirmMissing && !kit.ready && (
              <div className="engineer-notice warning" role="alert">
                <div>
                  <b>Не все материалы указаны</b>
                  <p>
                    Не отмечено: {missing.map((item) => item.label).join(', ')}. Отправьте недостачу
                    диспетчеру или вернитесь к проверке комплекта.
                  </p>
                </div>
              </div>
            )}
            {confirmMissing && !kit.ready ? (
              <>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await send(
                        'engineer.kit.submit',
                        { id: e.id, confirmMissing: true },
                        'Недостача отправлена диспетчеру',
                      )
                    )
                      setConfirmMissing(false);
                  }}
                >
                  Не хватает материалов, отправить
                </Button>
                <Button disabled={busy} onClick={() => setConfirmMissing(false)}>
                  Проверить комплект
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => (kit.ready ? back() : setConfirmMissing(true))}
              >
                {kit.ready ? 'Перейти к работам' : 'Отправить'}
              </Button>
            )}
          </div>
        </>
      ) : view === 'order' ? (
        <>
          <h3 className="engineer-section-title">Впереди · {stops.length}</h3>
          {stops.map((s, i) => (
            <button
              className="engineer-order-row"
              key={s.jobId}
              onClick={() => (i === 0 ? back() : showDetails(s.jobId))}
            >
              <span>{i + 1}</span>
              <div>
                <b>{byId[s.jobId].address}</b>
                <small>
                  №{byId[s.jobId].number} · {byId[s.jobId].title} · окно {time(byId[s.jobId].windowStart)}–
                  {time(byId[s.jobId].windowEnd)}
                </small>
              </div>
              <time>{time(s.start)}</time>
            </button>
          ))}
          <p className="engineer-muted">Выполнено сегодня: {done}</p>
        </>
      ) : view === 'call' ? (
        <>
          <Notice title="Звонок выполняется">{DEMO_CLIENT_PHONE} · демонстрационный звонок</Notice>
          <div className="engineer-actions">
            <Button variant="primary" onClick={back}>
              Понятно
            </Button>
          </div>
        </>
      ) : view === 'closed' && closed ? (
        <>
          <Notice
            tone={closed.visitResult.outcome === 'complete' ? 'success' : 'warning'}
            title={closed.visitResult.outcome === 'complete' ? 'Всё выполнено' : 'Передано диспетчеру'}
          >
            Результат сохранён в {time(closed.visitResult.time)}.
          </Notice>
          <JobCard job={closed} details={false} />
          {current && (
            <>
              <h3 className="engineer-section-title">Следующая работа</h3>
              <JobCard job={current} stop={stop} details={false} />
            </>
          )}
          <div className="engineer-actions">
            <Button variant="primary" onClick={back}>
              {current ? 'Перейти к следующей работе' : 'Вернуться к моему дню'}
            </Button>
            <Button onClick={() => setScreen('order')}>Порядок дня</Button>
          </div>
        </>
      ) : !job ? (
        <>
          <Notice tone="success" title="Все выезды позади">
            Новые назначения появятся здесь.
          </Notice>
          <Button onClick={() => setScreen('kit')}>Комплект на смену</Button>
        </>
      ) : view === 'result' ? (
        <>
          <h3 className="engineer-section-title">Что получилось на объекте</h3>
          {[
            ['complete', 'Всё выполнено', 'Работа выполнена полностью, клиенту показан результат.'],
            ['partial', 'Выполнено частично', 'Остаток работы передаётся диспетчеру.'],
            ['failed', 'Не удалось выполнить', 'Диспетчер решит, что делать дальше.'],
          ].map(([value, label, detail]) => (
            <button
              key={value}
              className={`engineer-result ${value}`}
              onClick={() => {
                setOutcome(value);
                setScreen('confirm');
              }}
            >
              <b>{label}</b>
              <small>{detail}</small>
            </button>
          ))}
          <p className="engineer-bottom-note">Результат сохраняется в общем рабочем дне.</p>
        </>
      ) : view === 'confirm' ? (
        <>
          <JobCard onOpen={() => showDetails(job.id)} job={job} details={false} />
          {outcome === 'complete' ? (
            <Notice
              tone={sopReady(job) && !job.sop?.diagnosticsOnly ? 'success' : 'warning'}
              title={sopReady(job) ? 'Чек-лист пройден' : 'Чек-лист ещё не завершён'}
            >
              {job.sop?.diagnosticsOnly
                ? 'Завершение диагностики не закрывает аварию. Выберите частичный результат и передайте выводы диспетчеру.'
                : sopReady(job)
                  ? 'Подтвердите результат, чтобы завершить визит.'
                  : 'Подтвердите условия и выполненные шаги SOP перед полным завершением.'}
            </Notice>
          ) : (
            <label className="engineer-report">
              Результат и следующие действия
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={2000}
                placeholder="Что выполнено, что мешает и какая помощь нужна"
              />
            </label>
          )}
          <div className="engineer-actions">
            <Button
              variant="primary"
              disabled={
                busy ||
                (outcome === 'complete' ? !sopReady(job) || job.sop?.diagnosticsOnly : !comment.trim())
              }
              onClick={async () => {
                if (await send('job.finish', { id: job.id, outcome, comment }, 'Результат визита сохранён')) {
                  setClosedId(job.id);
                  setScreen('closed');
                  setComment('');
                }
              }}
            >
              Подтвердить и завершить
            </Button>
            <Button onClick={() => setScreen('result')}>Назад к результатам</Button>
          </div>
        </>
      ) : view === 'contact' ? (
        <>
          <JobCard onOpen={() => showDetails(job.id)} job={job} details={false} />
          <ClientPhone key={job.id} />
          <h3 className="engineer-section-title">Условия доступа</h3>
          <p>{job.access || 'Учебный сценарий'}</p>
          <Notice title="Как попасть на объект">
            Уточните у клиента подъезд, этаж и наличие пропуска до начала работы.
          </Notice>
          <div className="engineer-actions">
            <Button variant="primary" onClick={() => setScreen('call')}>
              Позвонить клиенту
            </Button>
            <Button onClick={back}>Вернуться к визиту</Button>
          </div>
        </>
      ) : view === 'map' ? (
        <>
          <JobCard onOpen={() => showDetails(job.id)} job={job} details={false} />
          {miniMap}
          <p className="engineer-muted">Дорога по плану {duration(stop.travel)}</p>
          <div className="engineer-actions">
            <p className="engineer-muted">Открытие карт не меняет статус выезда.</p>
            <a
              className="button primary"
              target="_blank"
              rel="noreferrer"
              href={`https://www.openstreetmap.org/?mlat=${job.lat}&mlon=${job.lng}#map=17/${job.lat}/${job.lng}`}
            >
              Открыть в картах
            </a>
            <Button onClick={() => setScreen('contact')}>Контакт клиента</Button>
          </div>
        </>
      ) : (
        <>
          <JobCard onOpen={() => showDetails(job.id)} job={job} stop={job.status === 'pending' ? stop : null}>
            {job.status === 'enroute' && <ClientPhone key={job.id} />}
          </JobCard>
          {job.status === 'enroute' && !arrived && (
            <div className="engineer-call-action">
              <Button icon={Phone} onClick={() => setScreen('call')}>
                Позвонить
              </Button>
            </div>
          )}
          {e.pausedUntil > state.time && (
            <div className="phone-break">
              Перерыв до {time(e.pausedUntil)}
              <button disabled={busy} onClick={() => send('engineer.pause', { id: e.id, minutes: 0 })}>
                Вернуться
              </button>
            </div>
          )}
          {job.status === 'working' ? (
            <>
              <WorkTimer job={job} minute={state.time} />
              <h3 className="engineer-section-title">Чек-лист перед результатом</h3>
              {job.sop ? (
                <>
                  <p className="engineer-muted">{job.sop.title}</p>
                  <CheckRow
                    checked={Boolean(job.sop.prerequisitesConfirmed)}
                    disabled={busy || automatic}
                    detail={job.sop.prerequisites}
                    onChange={(event) => check({ prerequisitesConfirmed: event.target.checked })}
                  >
                    Условия применения подтверждены
                  </CheckRow>
                  {job.sop.steps.map((step) => (
                    <CheckRow
                      key={step.id}
                      checked={Boolean(step.done)}
                      disabled={busy || automatic || !job.sop.prerequisitesConfirmed}
                      onChange={(event) => check({ stepId: step.id, done: event.target.checked })}
                    >
                      {step.text}
                    </CheckRow>
                  ))}
                  <p className="engineer-muted">
                    {sopReady(job)
                      ? 'Все пункты отмечены'
                      : `Осталось отметить: ${job.sop.steps.filter((s) => !s.done).length}`}{' '}
                    · начали в {time(job.actualStart)}
                  </p>
                </>
              ) : (
                <Notice title="SOP не выбран">
                  Для этой работы нет стандартного регламента. Уточните порядок работ у диспетчера.
                  <button className="engineer-text-link" onClick={() => showDetails(job.id)}>
                    Открыть карточку и регламент
                  </button>
                </Notice>
              )}
              <div className="engineer-actions">
                <Button variant="primary" onClick={() => setScreen('result')}>
                  Завершить визит
                </Button>
                {issue}
              </div>
            </>
          ) : arrived ? (
            <>
              <Notice
                tone={early ? 'warning' : 'info'}
                title={
                  early ? `Ожидание окна · ещё ${duration(job.windowStart - state.time)}` : 'Вы на объекте'
                }
              >
                Прибытие отмечено в {time(job.arrivedAt)}. Окно клиента открывается в {time(job.windowStart)}.
              </Notice>
              <Button icon={Phone} onClick={() => setScreen('contact')}>
                Контакт клиента и условия доступа
              </Button>
              <div className="engineer-actions">
                <Button
                  variant="primary"
                  disabled={busy || early || state.time > job.windowEnd}
                  onClick={() => send('job.start', { id: job.id })}
                >
                  {early ? `Начать можно с ${time(job.windowStart)}` : 'Начать работу'}
                </Button>
                {issue}
              </div>
            </>
          ) : job.status === 'enroute' ? (
            <>
              <Notice title="Выезд отмечен">
                Диспетчер видит, что вы в пути. Отметьте прибытие, когда будете на объекте.
              </Notice>
              {miniMap}
              <p className="engineer-muted">
                Выехали в {time(job.departedAt ?? stop.depart)} · в плане прибытие {time(stop.arrival)}
              </p>
              <div className="engineer-actions">
                <Button variant="primary" disabled={busy} onClick={() => send('job.arrive', { id: job.id })}>
                  Я на месте
                </Button>
                <a
                  className="button"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${job.lat}&mlon=${job.lng}#map=17/${job.lat}/${job.lng}`}
                >
                  Открыть в картах
                </a>
                {issue}
              </div>
            </>
          ) : (
            <>
              <button className="engineer-kit-summary" onClick={() => setScreen('kit')}>
                <Check size={14} />
                Комплект собран · {kit.checked} из {kit.items.length}
              </button>
              {kit.uncovered > 0 && (
                <p className="engineer-muted">
                  SOP не выбран для {kit.uncovered} заявок — уточните комплект у диспетчера.
                </p>
              )}
              <h3 className="engineer-section-title">Дальше сегодня · {Math.max(0, stops.length - 1)}</h3>
              {stops.slice(1, 4).map((s) => (
                <div className="engineer-upcoming" key={s.jobId}>
                  <b>{time(s.start)}</b>
                  <span>{byId[s.jobId].address}</span>
                </div>
              ))}
              <p className="engineer-muted">
                Выполнено сегодня: {done} · всего в маршруте {stops.length + done}
              </p>
              <div className="engineer-actions">
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    !kit.ready ||
                    state.time < e.shiftStart ||
                    state.time >= e.shiftEnd ||
                    e.pausedUntil > state.time
                  }
                  onClick={() => send('job.depart', { id: job.id })}
                >
                  Выехать на объект
                </Button>
                <Button onClick={() => setScreen('order')}>Порядок дня · {stops.length + done}</Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

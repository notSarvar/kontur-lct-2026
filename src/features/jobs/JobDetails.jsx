import React, { useState } from 'react';
import { Check, CheckCheck, FileText, Headphones, ShieldCheck, TriangleAlert } from 'lucide-react';
import { time, duration, transport, statusText } from '../../shared/format.js';
import { Button, Avatar, Badge, Modal } from '../../components/ui.jsx';

export default function JobDetails({ job: j, state, onClose, edit, act, busy }) {
  const [note, setNote] = useState('');
  const e = state.engineers.find((e) => e.id === j.engineerId),
    route = state.plan.routes.find((r) => r.stops.some((s) => s.jobId === j.id)),
    s = route?.stops.find((s) => s.jobId === j.id),
    reason = state.plan.unassigned.find((u) => u.jobId === j.id),
    exp = route?.explanations.find((x) => x.jobId === j.id);
  const noteSubmit = async () => {
    if (await act('job.note', { id: j.id, text: note }, 'Отчёт сохранён и виден диспетчеру')) setNote('');
  };
  return (
    <Modal title={`#${j.number} · ${j.title}`} subtitle={j.address} onClose={onClose}>
      <div className="modal-body details">
        <div className="detail-status">
          <Badge tone={j.status === 'done' ? 'green' : !e || j.status === 'blocked' ? 'orange' : 'purple'}>
            {j.status === 'pending' && !e ? 'Не назначена' : statusText[j.status]}
          </Badge>
          {j.priority === 'urgent' && <Badge tone="orange">Срочная</Badge>}
          {e && (
            <span className="table-person">
              <Avatar engineer={e} size="small" />
              {e.name}
            </span>
          )}
        </div>
        <div className="detail-numbers">
          <span>
            Окно начала
            <b>
              {time(j.windowStart)}–{time(j.windowEnd)}
            </b>
          </span>
          <span>
            Работа<b>{j.duration} мин</b>
          </span>
          <span>
            Приоритет<b>{j.priority === 'urgent' ? 'Авария' : 'Обычная'}</b>
          </span>
        </div>
        {s && (
          <div className={`schedule-explanation ${s.late ? 'warning' : ''}`}>
            <ShieldCheck size={20} />
            <div>
              <b>
                План: {time(s.start)}–{time(s.end)}
              </b>
              <p>{exp?.text || 'Текущий выезд закреплён за инженером и сохраняется при перепланировании.'}</p>
              <small>
                Дорога {s.travel} мин · ожидание {s.wait} мин
                {exp?.changed ? ' · назначенный инженер изменился' : ''}
              </small>
            </div>
          </div>
        )}
        {reason && (
          <div className="schedule-explanation warning">
            <TriangleAlert size={20} />
            <div>
              <b>Почему заявка не назначена</b>
              <p>{reason.text}</p>
            </div>
          </div>
        )}
        {j.status === 'done' && (
          <div className="schedule-explanation">
            <CheckCheck size={20} />
            <div>
              <b>
                Факт: {time(j.actualStart)}–{time(j.actualEnd)}
              </b>
              <p>
                {j.actualStart <= j.windowEnd && j.actualStart >= j.windowStart
                  ? 'Работа начата в согласованном окне'
                  : 'Начало работы вне согласованного окна'}
              </p>
            </div>
          </div>
        )}
        {j.originalWindow && (
          <p className="contact-note">
            Исходное окно: {time(j.originalWindow.start)}–{time(j.originalWindow.end)}
          </p>
        )}
        <h3>Ресурсы для выезда</h3>
        <div className="tags">
          {j.skills.map((k) => (
            <Badge key={k} tone="green">
              {state.catalog.skills[k]}
            </Badge>
          ))}
          {j.equipment.map((k) => (
            <Badge key={k}>{state.catalog.equipment[k]}</Badge>
          ))}
          <Badge>{transport[j.requiredTransport]}</Badge>
        </div>
        {j.contact && <p className="contact-note">{j.contact}</p>}
        <h3>Отчёты с объекта</h3>
        {j.notes.length ? (
          j.notes.map((n) => (
            <div className="job-note" key={n.id}>
              <time>{time(n.time)}</time>
              <p>{n.text}</p>
            </div>
          ))
        ) : (
          <p className="muted">Отчётов пока нет.</p>
        )}
        <textarea
          aria-label="Отчёт инженера"
          placeholder="Что сделано, что важно знать диспетчеру…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
        />
        <div className="note-actions">
          <Button icon={FileText} disabled={!note.trim() || busy} onClick={noteSubmit}>
            Сохранить отчёт
          </Button>
          {j.status !== 'done' && (
            <Button
              icon={Headphones}
              disabled={busy}
              onClick={() =>
                act(
                  'job.issue',
                  { id: j.id, text: note || 'Не удалось выполнить работу. Требуется помощь диспетчера.' },
                  'Обращение создано, остальные заявки перепланированы',
                )
              }
            >
              Сообщить о проблеме
            </Button>
          )}
        </div>
        <div className="form-actions">
          {['pending', 'manual_review'].includes(j.status) && (
            <>
              <Button
                variant="danger-ghost"
                disabled={busy}
                onClick={async () => {
                  if (await act('job.delete', { id: j.id }, 'Заявка удалена')) onClose();
                }}
              >
                Удалить
              </Button>
              <Button onClick={edit}>
                {j.status === 'manual_review' ? 'Согласовать время / адрес' : 'Изменить'}
              </Button>
            </>
          )}
          {j.status === 'working' && (
            <Button
              variant="primary"
              icon={Check}
              disabled={busy}
              onClick={() => act('job.complete', { id: j.id }, 'Работа завершена')}
            >
              Завершить работу
            </Button>
          )}
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </Modal>
  );
}

import React, { useState } from 'react';
import { Check, CheckCheck, FileText, Headphones, ShieldCheck, TriangleAlert } from 'lucide-react';
import { time, duration, transport, statusText } from '../../shared/format.js';
import { Button, Avatar, Badge, Modal } from '../../components/ui.jsx';
import SopPanel from './Sop.jsx';

export default function JobDetails({ job: j, state, onClose, edit, act, busy, assign, demo = false }) {
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
    <Modal title={`Заявка №${j.number}`} subtitle={j.address} onClose={onClose}>
      <div className="modal-body details">
        <h3 className="job-detail-title">{j.title}</h3>
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
        </div>
        {j.source?.fields && (
          <details className="source-details" open={demo || undefined}>
            <summary>Исходные данные и допущения</summary>
            <div className="analysis-note">
              <b>BK:</b> {j.source.fields['Тип заявки BK']} · <b>HD:</b> {j.source.fields['Тип заявки HD']}
              <br />
              {j.source.priorityBasis}
              {j.source.assumptions?.map((text, i) => (
                <p key={i}>Допущение: {text}</p>
              ))}
            </div>
          </details>
        )}
        {s && (
          <div className={`schedule-explanation ${s.late ? 'warning' : ''}`}>
            <ShieldCheck size={20} />
            <div>
              <b>
                План: {time(s.start)}–{time(s.end)}
              </b>
              <p>
                {s.locked
                  ? 'Текущий выезд сохраняется при перепланировании.'
                  : 'Начало в клиентском окне, завершение в пределах смены.'}
              </p>
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
        <SopPanel job={j} state={state} act={act} busy={busy} />
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
        {['pending', 'manual_review', 'working'].includes(j.status) && (
          <div className="form-actions">
            {j.status === 'pending' && (
              <Button onClick={assign} disabled={busy}>
                Переназначить
              </Button>
            )}
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
          </div>
        )}
      </div>
    </Modal>
  );
}

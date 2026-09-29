import React, { useState } from 'react';
import { Button, Field, Modal } from '../../components/ui.jsx';

// getRandomValues also works on HTTP; randomUUID requires a secure context.
const createStepId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );

export function SopEditor({ sop, save, cancel, busy, autoFocus = false }) {
  const [form, setForm] = useState(structuredClone(sop));
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="form-stack sop-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save(form);
      }}
    >
      <Field label="Название регламента">
        <input
          autoFocus={autoFocus}
          required
          maxLength={180}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>
      {Object.entries({
        scope: 'Объём работ',
        prerequisites: 'Условия применения',
        result: 'Ожидаемый результат',
        escalation: 'Когда передать диспетчеру',
      }).map(([k, label]) => (
        <Field label={label} key={k}>
          <textarea maxLength={3000} value={form[k]} onChange={(e) => set(k, e.target.value)} />
        </Field>
      ))}
      {Object.entries({
        materials: 'Материалы: по одному на строке',
        tools: 'Инструменты: по одному на строке',
      }).map(([k, label]) => (
        <Field key={k} label={label}>
          <textarea value={form[k].join('\n')} onChange={(e) => set(k, e.target.value.split('\n'))} />
        </Field>
      ))}
      <h4>Шаги и расчётные минуты без дороги</h4>
      {form.steps.map((s, i) => (
        <div className="sop-step-edit" key={s.id}>
          <Field label={`Шаг ${i + 1}`}>
            <textarea
              required
              value={s.text}
              maxLength={3000}
              onChange={(e) =>
                set(
                  'steps',
                  form.steps.map((v) => (v.id === s.id ? { ...v, text: e.target.value } : v)),
                )
              }
            />
          </Field>
          <Field label="Минут">
            <input
              type="number"
              min="0"
              max="480"
              required
              value={s.minutes}
              onChange={(e) =>
                set(
                  'steps',
                  form.steps.map((v) => (v.id === s.id ? { ...v, minutes: Number(e.target.value) } : v)),
                )
              }
            />
          </Field>
          <Button
            type="button"
            disabled={form.steps.length === 1}
            onClick={() =>
              set(
                'steps',
                form.steps.filter((v) => v.id !== s.id),
              )
            }
          >
            Удалить шаг
          </Button>
        </div>
      ))}
      <Button
        type="button"
        disabled={form.steps.length >= 30}
        onClick={() => set('steps', [...form.steps, { id: createStepId(), text: '', minutes: 5 }])}
      >
        Добавить шаг
      </Button>
      <p className="muted">
        Итого: {form.steps.reduce((sum, s) => sum + s.minutes, 0)} мин. Длительность заявки не меняется
        автоматически. Изменённые шаги потребуется подтвердить заново.
      </p>
      <div className="form-actions">
        <Button type="button" onClick={cancel}>
          Отменить правки
        </Button>
        <Button variant="primary" disabled={busy} type="submit">
          Сохранить регламент
        </Button>
      </div>
    </form>
  );
}

export default function SopPanel({ job, state, act, busy, onEdit }) {
  const [templateId, setTemplateId] = useState(
    job.sop?.templateId || state.sopTemplates?.[0]?.id || 'router',
  );
  const sop = job.sop,
    readonly = job.status === 'done',
    automatic = state.settings.autoChecklists !== false;
  const action = (type, p = {}) =>
    act(type, { id: job.id, expectedRevision: state.revision, ...p }, 'Регламент сохранён');
  return (
    <section className="sop-panel">
      <div className="sop-heading">
        <h3>Регламент работ</h3>
        {sop && !readonly && (
          <Button className="sop-edit-button" disabled={busy} onClick={onEdit}>
            Изменить чек-лист
          </Button>
        )}
      </div>
      {!readonly && (
        <div className="sop-selection">
          <select
            aria-label="Шаблон регламента"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {state.sopTemplates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · v{t.version}
              </option>
            ))}
          </select>
          <Button
            disabled={busy || (!automatic && sop?.steps.some((s) => s.done))}
            onClick={() => action('job.sop.apply', { templateId })}
          >
            {sop ? 'Заменить шаблоном' : 'Применить шаблон'}
          </Button>
        </div>
      )}
      {!sop && (
        <p className="muted">
          Для этого вида работ нет однозначного стандартного SOP. Выберите подходящий после проверки условий.
        </p>
      )}
      {sop && (
        <>
          <h4>{sop.title}</h4>
          {automatic && (
            <p className="muted">
              Симуляция: чек-лист заполнен автоматически. Ручное прохождение включается на экране инженера.
            </p>
          )}
          <p>{sop.scope}</p>
          <p className="muted">
            Копия шаблона v{sop.version}
            {sop.customized ? ' · изменена в заявке' : ''}. {sop.timeBasis}
          </p>
          <label className="sop-prerequisites">
            <input
              type="checkbox"
              checked={Boolean(sop.prerequisitesConfirmed)}
              disabled={busy || readonly || automatic}
              onChange={(e) => action('job.sop.check', { prerequisitesConfirmed: e.target.checked })}
            />
            <span>
              <b>Условия применения подтверждены</b>
              <small>{sop.prerequisites}</small>
            </span>
          </label>
          <ol className="sop-checklist">
            {sop.steps.map((s) => (
              <li key={s.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(s.done)}
                    disabled={busy || readonly || automatic || !sop.prerequisitesConfirmed}
                    onChange={(e) => action('job.sop.check', { stepId: s.id, done: e.target.checked })}
                  />
                  <span>{s.text}</span>
                  <small>{s.minutes} мин</small>
                </label>
              </li>
            ))}
          </ol>
          <div className="sop-duration">
            <span>
              SOP: <b>{sop.steps.reduce((sum, s) => sum + s.minutes, 0)} мин</b> · в маршруте:{' '}
              <b>{job.duration} мин</b>
            </span>
            {job.status === 'pending' && !sop.diagnosticsOnly && (
              <Button
                disabled={busy}
                onClick={() =>
                  act(
                    'job.save',
                    { ...job, duration: sop.steps.reduce((sum, s) => sum + s.minutes, 0) },
                    'Длительность передана в расчёт',
                  )
                }
              >
                Взять время из SOP
              </Button>
            )}
          </div>
          <details className="source-details">
            <summary>Комплект, результат и передача диспетчеру</summary>
            <h4>Материалы</h4>
            <ul>
              {sop.materials.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <h4>Инструменты</h4>
            <ul>
              {sop.tools.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p>
              <b>Результат:</b> {sop.result}
            </p>
            <p>
              <b>Передать:</b> {sop.escalation}
            </p>
            <small>
              Источник: {sop.source?.file}, версия {sop.sourceVersion}. Комплект нужно подтвердить; он не
              заменяет проверку ресурсов планировщиком.
            </small>
          </details>
          {sop.diagnosticsOnly && (
            <p className="sop-warning">
              Чек-лист завершает только диагностику. Авария не закрывается, норматив полного выезда
              сохраняется. Результат и следующие работы передайте диспетчеру.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function SopTemplates({ state, onClose, act, busy }) {
  const [selected, setSelected] = useState(null);
  return (
    <Modal
      title="Стандартные регламенты"
      subtitle="Новые версии применяются только к новым копиям; существующие заявки сохраняют свои чек-листы"
      onClose={onClose}
    >
      <div className="modal-body form-stack">
        {selected ? (
          <SopEditor
            key={selected.id}
            autoFocus
            sop={state.sopTemplates.find((t) => t.id === selected.id)}
            busy={busy}
            cancel={() => setSelected(null)}
            save={async (sop) => {
              if (
                await act(
                  'sop.template.save',
                  { id: selected.id, sop, expectedRevision: selected.revision },
                  'Шаблон обновлён',
                )
              )
                setSelected(null);
            }}
          />
        ) : (
          state.sopTemplates?.map((t) => (
            <div className="sop-template" key={t.id}>
              <div>
                <b>{t.title}</b>
                <p>
                  {t.steps.reduce((sum, s) => sum + s.minutes, 0)} мин · v{t.version} ·{' '}
                  {t.edited ? 'изменённый шаблон' : 'из предоставленного PDF'}
                </p>
                <small>{t.scope}</small>
              </div>
              <Button onClick={() => setSelected({ id: t.id, revision: state.revision })}>
                Редактировать шаблон
              </Button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

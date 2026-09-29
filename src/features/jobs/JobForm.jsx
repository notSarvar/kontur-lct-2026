import EngineerRecommendations from './EngineerRecommendations.jsx';
import React, { useState } from 'react';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import { time, minutes, duration, transport } from '../../shared/format.js';
import { Button, Modal, Field } from '../../components/ui.jsx';
import RouteMap from '../../components/RouteMap.jsx';

export default function JobForm({ job, state, urgent, onClose, save, busy }) {
  const { catalog } = state;
  const resolving = job?.status === 'manual_review';
  const defaultStart = Math.min(1300, Math.max(540, state.time + 30));
  const [form, setForm] = useState(
    job
      ? structuredClone(job)
      : {
          title: urgent ? 'Авария на ТКД' : 'Локальная заявка / ремонт',
          type: urgent ? 'emergency' : 'local',
          address: '',
          lat: 55.7573,
          lng: 37.6216,
          contact: '',
          windowStart: defaultStart,
          windowEnd: Math.min(1439, defaultStart + 120),
          duration: urgent ? 80 : 30,
          skills: [catalog.types[urgent ? 'emergency' : 'local'].skill],
          equipment: [],
          requiredTransport: 'any',
          priority: urgent ? 'urgent' : 'normal',
        },
  );
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key, value) =>
    set(key, form[key].includes(value) ? form[key].filter((k) => k !== value) : [...form[key], value]);
  const chooseType = (key) => {
    const t = catalog.types[key];
    setForm((f) => ({
      ...f,
      type: key,
      title: t.name,
      skills: [t.skill],
      equipment: t.equipment,
      duration: t.duration,
      requiredTransport: 'any',
      priority: key === 'emergency' ? 'urgent' : 'normal',
    }));
  };
  return (
    <Modal
      title={
        resolving ? `Согласование #${job.number}` : job ? `Редактирование #${job.number}` : 'Новая заявка'
      }
      subtitle="После сохранения команда получит обновлённые маршруты"
      onClose={onClose}
      wide
    >
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          save(form);
        }}
      >
        <div className="form-columns">
          <div className="form-stack">
            <div className="form-row">
              <Field label="Тип работ">
                <select value={form.type} onChange={(e) => chooseType(e.target.value)}>
                  {Object.entries(catalog.types).map(([k, t]) => (
                    <option value={k} key={k}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Приоритет">
                <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  <option value="normal">Обычный</option>
                  <option value="urgent">Срочный</option>
                </select>
              </Field>
            </div>
            <Field label="Название заявки">
              <input
                required
                maxLength={179}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </Field>
            <Field
              label="Адрес / название объекта"
              hint="Адрес — подпись. Для расчёта выберите точное положение на карте."
            >
              <input
                required
                placeholder="Например, Тверская улица, 18"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </Field>
            <Field label="Контакт или комментарий к доступу">
              <input
                value={form.contact}
                onChange={(e) => set('contact', e.target.value)}
                placeholder="Вход со двора, встретит администратор"
              />
            </Field>
            <div className="form-row">
              <Field label="Окно: с">
                <input
                  type="time"
                  required
                  value={time(form.windowStart)}
                  onChange={(e) => set('windowStart', minutes(e.target.value))}
                />
              </Field>
              <Field label="Начать до">
                <input
                  type="time"
                  required
                  value={time(form.windowEnd)}
                  onChange={(e) => set('windowEnd', minutes(e.target.value))}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field
                label="Длительность, минут"
                hint={
                  catalog.types[form.type]?.durationAssumption ||
                  'Работа на адресе; дорога считается отдельно'
                }
              >
                <input
                  required
                  type="number"
                  min="5"
                  max="480"
                  value={form.duration}
                  onChange={(e) => set('duration', Number(e.target.value))}
                />
              </Field>
              <Field label="Нужный транспорт">
                <select
                  value={form.requiredTransport}
                  onChange={(e) => set('requiredTransport', e.target.value)}
                >
                  {['any', 'transit', 'foot', 'car', 'bike'].map((k) => (
                    <option key={k} value={k}>
                      {transport[k]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
          <div className="form-stack">
            <div className="picker-map">
              <RouteMap
                picker={{ lat: form.lat ?? 55.75, lng: form.lng ?? 37.62 }}
                onPick={(p) => setForm((f) => ({ ...f, ...p }))}
              />
            </div>
            <div className="form-row">
              <Field label="Широта">
                <input
                  type="number"
                  step="any"
                  min="-85"
                  max="85"
                  required
                  value={form.lat ?? ''}
                  onChange={(e) => set('lat', Number(e.target.value))}
                />
              </Field>
              <Field label="Долгота">
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  value={form.lng ?? ''}
                  onChange={(e) => set('lng', Number(e.target.value))}
                />
              </Field>
            </div>
            {resolving && job.geocodingCandidates?.length > 0 && (
              <Field label="Варианты адреса — проверьте на карте">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const c = job.geocodingCandidates[+e.target.value];
                    if (c) setForm((f) => ({ ...f, lat: c.lat, lng: c.lng }));
                  }}
                >
                  <option value="" disabled>
                    Выберите совпадение или точку вручную
                  </option>
                  {job.geocodingCandidates.map((c, i) => (
                    <option key={i} value={i}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <fieldset>
              <legend>Необходимая квалификация</legend>
              <div className="check-grid">
                {Object.entries(catalog.skills).map(([k, v]) => (
                  <label key={k}>
                    <input
                      type="radio"
                      name="skill"
                      checked={form.skills.includes(k)}
                      onChange={() => set('skills', [k])}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Оборудование на выезде</legend>
              <div className="check-grid">
                {Object.entries(catalog.equipment).map(([k, v]) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={form.equipment.includes(k)}
                      onChange={() => toggle('equipment', k)}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
        {resolving && (
          <div className="resolution-fields">
            <p>
              Окно не меняется автоматически. Укажите результат связи с клиентом; если проблема только в
              адресе — результат проверки точки.
            </p>
            <Field label="Результат согласования">
              <textarea
                required
                maxLength={2000}
                value={form.confirmationNote || ''}
                onChange={(e) => set('confirmationNote', e.target.value)}
                placeholder="Клиент подтвердил новое время / адрес проверен"
              />
            </Field>
            {form.priority === 'urgent' && (
              <EngineerRecommendations
                form={form}
                state={state}
                selected={form.pinnedEngineerId}
                onSelect={(id) => set('pinnedEngineerId', id)}
                busy={busy}
              />
            )}
            <Field label="Назначить инженера">
              <select
                value={form.pinnedEngineerId || ''}
                onChange={(e) => set('pinnedEngineerId', e.target.value)}
              >
                <option value="">Выбрать алгоритмом</option>
                {state.engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <div className="form-actions">
          <span>
            <ShieldCheck size={14} />
            Назначение только при соблюдении ограничений
          </span>
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={busy} icon={busy ? Loader2 : Plus}>
            {resolving
              ? 'Подтвердить и перепланировать'
              : job
                ? 'Сохранить изменения'
                : 'Создать и перепланировать'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import React, { useState } from 'react';

import { time, minutes, transport } from '../../shared/format.js';
import { Button, Modal, Field } from '../../components/ui.jsx';

export default function EngineerForm({ engineer, catalog, onClose, save, busy }) {
  const [form, setForm] = useState(structuredClone(engineer));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (key, value) =>
    set(key, form[key].includes(value) ? form[key].filter((k) => k !== value) : [...form[key], value]);
  return (
    <Modal
      title="Ресурсы инженера"
      subtitle="Изменения повлияют на распределение оставшихся заявок"
      onClose={onClose}
    >
      <form
        className="modal-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(form);
        }}
      >
        <Field label="Имя инженера">
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="form-row three">
          <Field label="Смена с">
            <input
              required
              type="time"
              value={time(form.shiftStart)}
              onChange={(e) => set('shiftStart', minutes(e.target.value))}
            />
          </Field>
          <Field label="Смена до">
            <input
              required
              type="time"
              value={time(form.shiftEnd)}
              onChange={(e) => set('shiftEnd', minutes(e.target.value))}
            />
          </Field>
          <Field label="Транспорт">
            <select value={form.transport} onChange={(e) => set('transport', e.target.value)}>
              {['transit', 'foot', 'car', 'bike', 'none'].map((k) => (
                <option key={k} value={k}>
                  {transport[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset>
          <legend>Квалификация</legend>
          <div className="check-grid">
            {Object.entries(catalog.skills).map(([k, v]) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={form.skills.includes(k)}
                  onChange={() => toggle('skills', k)}
                />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Закреплённое оборудование</legend>
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
        <div className="form-row">
          <Field label="База: широта">
            <input
              required
              type="number"
              step="any"
              value={form.home.lat}
              onChange={(e) => set('home', { ...form.home, lat: Number(e.target.value) })}
            />
          </Field>
          <Field label="База: долгота">
            <input
              required
              type="number"
              step="any"
              value={form.home.lng}
              onChange={(e) => set('home', { ...form.home, lng: Number(e.target.value) })}
            />
          </Field>
        </div>
        <small className="muted">
          База меняет стартовую позицию до первого выезда инженера. После выполненных работ сохраняется
          текущее положение.
        </small>
        <div className="form-actions">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Сохранить и пересчитать
          </Button>
        </div>
      </form>
    </Modal>
  );
}

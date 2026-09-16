import React, { useState } from 'react';
import { Modal, Field, Button } from '../../components/ui.jsx';
export default function Settings({ state, onClose, save, busy }) {
  const [form, setForm] = useState({ ...state.settings });
  return (
    <Modal title="Настройки расчёта" subtitle="Источники поездок и стабильность назначений" onClose={onClose}>
      <form
        className="modal-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(form);
        }}
      >
        <Field label="Цель планирования">
          <select value={form.mode || 'economy'} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="economy">Экономия — меньше инженеров</option>
            <option value="emergency">Аварийное реагирование — раньше обслужить срочные</option>
          </select>
        </Field>
        <Field label="Время переездов">
          <select value={form.roadMode} onChange={(e) => setForm({ ...form, roadMode: e.target.value })}>
            <option value="estimate">Пешком и общественным транспортом — оценка</option>
            <option value="prepared">Пешком по дорожной сети; общественный транспорт — оценка</option>
            <option value="osrm">OSRM для автомобилей; остальные — оценка</option>
          </select>
        </Field>
        <p>{state.plan.roadDetail}</p>
        <label className="toggle-row">
          <span>
            <b>Сохранять назначенного инженера</b>
            <small>После покрытия и основных целей, перед сокращением километров</small>
          </span>
          <input
            type="checkbox"
            checked={form.stability}
            onChange={(e) => setForm({ ...form, stability: e.target.checked })}
          />
        </label>
        <p>
          Окно ограничивает начало работы. Уже начатые выезды сохраняются. Если допустимый план не найден,
          заявка требует согласования диспетчером.
        </p>
        <div className="form-actions">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Применить и пересчитать
          </Button>
        </div>
      </form>
    </Modal>
  );
}

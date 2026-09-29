import { apiFetch } from '../../shared/api.js';
import React, { useState, useEffect } from 'react';
import { Modal, Field, Button } from '../../components/ui.jsx';
export default function Settings({ state, onClose, save, busy, onTemplates }) {
  const [form, setForm] = useState({ ...state.settings });
  const [capabilities, setCapabilities] = useState(null);
  useEffect(() => {
    let active = true;
    apiFetch('/api/optimizers')
      .then((r) => r.json())
      .then((r) => {
        if (active) setCapabilities(r);
      })
      .catch(() => {
        if (active)
          setCapabilities({ ortools: { available: false, message: 'Не удалось проверить OR-Tools' } });
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Modal
      title="Настройки расчёта"
      subtitle="Приоритеты планирования, время в пути и стабильность назначений"
      onClose={onClose}
    >
      <form
        className="modal-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(form);
        }}
      >
        <Field label="Алгоритм расчёта">
          <select
            value={form.solver || 'alns'}
            onChange={(e) => setForm({ ...form, solver: e.target.value })}
          >
            <option value="alns">Наш алгоритм · ALNS</option>
            <option value="ortools" disabled={!capabilities?.ortools.available}>
              Google OR-Tools · CP-SAT
            </option>
          </select>
        </Field>
        {capabilities?.ortools.available ? (
          <small className="muted">OR-Tools {capabilities.ortools.version} подключён локально.</small>
        ) : (
          <small className="muted">{capabilities?.ortools.message || 'Проверяю доступность OR-Tools…'}</small>
        )}
        {(form.solver || 'alns') === 'alns' ? (
          <div className="form-row">
            <Field label="Итераций на запуск">
              <input
                type="number"
                min="0"
                max="1000"
                required
                value={form.alnsIterations ?? 60}
                onChange={(e) => setForm({ ...form, alnsIterations: Number(e.target.value) })}
              />
            </Field>
            <Field label="Запусков с разными seed">
              <input
                type="number"
                min="1"
                max="5"
                required
                value={form.alnsRestarts ?? 1}
                onChange={(e) => setForm({ ...form, alnsRestarts: Number(e.target.value) })}
              />
            </Field>
          </div>
        ) : (
          <Field label="Бюджет OR-Tools, секунд">
            <input
              type="number"
              min="1"
              max="60"
              required
              value={form.ortoolsSeconds ?? 10}
              onChange={(e) => setForm({ ...form, ortoolsSeconds: Number(e.target.value) })}
            />
          </Field>
        )}
        <p className="muted">
          Больше поиска может улучшить маршрут, но не точность исходного времени в пути. Сравнить оба решателя
          на одном снимке можно в отдельном пульте хакатона.
        </p>
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
            <b>Баланс работы с учётом прошлых смен</b>
            <small>
              После покрытия, количества инженеров и срочности; перед стабильностью и километрами. Учитывается
              работа на объектах, без дороги и ожидания.
            </small>
          </span>
          <input
            type="checkbox"
            checked={Boolean(form.balanceWork)}
            onChange={(e) => setForm({ ...form, balanceWork: e.target.checked })}
          />
        </label>
        <p className="muted">
          История задаётся в ресурсах инженера: минуты работы и доступное время за одинаковый период. При
          равных условиях меньше нагружаем тех, кто уже много работал.
        </p>
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
          <Button type="button" onClick={onTemplates}>
            Шаблоны работ
          </Button>
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

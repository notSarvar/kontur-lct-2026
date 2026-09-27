import React, { useState } from 'react';
import { ArrowRight, Clock3 } from 'lucide-react';
import { Avatar, Button, Empty, Field, Modal } from '../../components/ui.jsx';
import { duration, time } from '../../shared/format.js';
import { freeWindows } from './availability.js';

export default function Availability({ state, onClose, onSelect }) {
  const [minimum, setMinimum] = useState(30);
  const [skill, setSkill] = useState('all');
  const available = state.engineers
    .filter((e) => skill === 'all' || e.skills.includes(skill))
    .map((engineer) => ({ engineer, window: freeWindows(state, engineer, minimum)[0] }))
    .filter((e) => e.window)
    .sort((a, b) => a.window.start - b.window.start || b.window.end - a.window.end);
  return (
    <Modal
      title="Ближайшие свободные окна"
      subtitle={`По текущему плану на ${time(state.time)}`}
      onClose={onClose}
    >
      <div className="modal-body form-stack">
        <div className="form-row">
          <Field label="Минимум свободного времени">
            <select value={minimum} onChange={(e) => setMinimum(Number(e.target.value))}>
              {[15, 30, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} минут
                </option>
              ))}
            </select>
          </Field>
          <Field label="Навык инженера">
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="all">Любой навык</option>
              {Object.entries(state.catalog.skills).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="availability-note">
          <Clock3 size={16} /> Дорога к новой заявке и её требования проверяются при назначении. Здесь
          показаны только промежутки без выездов и работ.
        </p>
        <div className="availability-list">
          {available.map(({ engineer, window }) => (
            <div className="availability-row" key={engineer.id}>
              <Avatar engineer={engineer} />
              <div>
                <b>{engineer.name}</b>
                <small>{engineer.skills.map((s) => state.catalog.skills[s]).join(' · ')}</small>
              </div>
              <div className="availability-time">
                <b>
                  {time(window.start)}–{time(window.end)}
                </b>
                <small>
                  {window.start === state.time ? 'Сейчас · ' : ''}
                  {duration(window.end - window.start)}
                </small>
              </div>
              <Button
                icon={ArrowRight}
                aria-label={`Показать окно: ${engineer.name}`}
                onClick={() => onSelect(engineer.id, window)}
              >
                График
              </Button>
            </div>
          ))}
          {!available.length && <Empty text="В оставшейся смене подходящих свободных окон нет." />}
        </div>
      </div>
    </Modal>
  );
}

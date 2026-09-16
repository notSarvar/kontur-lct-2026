import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { time } from '../../shared/format.js';
import { Button, Modal, Field } from '../../components/ui.jsx';

export default function RandomForm({ state, onClose, save, busy }) {
  const [count, setCount] = useState(3),
    [seed, setSeed] = useState(Math.floor(Math.random() * 100000));
  return (
    <Modal
      title="Поток новых заявок"
      subtitle="Текущий день, выполненные работы и отчёты сохранятся"
      onClose={onClose}
    >
      <form
        className="modal-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save({ count, seed });
        }}
      >
        <Field label={`Добавить заявок: ${count}`}>
          <input
            type="range"
            min="1"
            max="20"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </Field>
        <Field label="Seed">
          <input
            type="number"
            required
            min="0"
            max="4294967295"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
          />
        </Field>
        <p className="muted">
          Время поступления: {time(state.time)}. Окна новых визитов начинаются не раньше, чем через 15 минут.
          Алгоритм проверит, какие заявки ещё можно выполнить сегодня.
        </p>
        <div className="form-actions">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" icon={Plus} variant="primary" disabled={busy}>
            Добавить и перепланировать
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import React, { useState } from 'react';
import { Modal, Field, Button } from '../../components/ui.jsx';
export default function AssignmentForm({ job, state, busy, save, onClose }) {
  const [engineerId, setEngineerId] = useState(job.pinnedEngineerId || job.engineerId || '');
  return (
    <Modal
      title={`Переназначение #${job.number}`}
      subtitle="Проверим весь будущий маршрут перед применением"
      onClose={onClose}
    >
      <form
        className="modal-body form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          save({ id: job.id, engineerId: engineerId || null });
        }}
      >
        <Field label="Новый исполнитель">
          <select value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>
            <option value="">Автоматически — снять закрепление</option>
            {state.engineers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.skills.map((s) => state.catalog.skills[s]).join(', ')}
              </option>
            ))}
          </select>
        </Field>
        <p>
          Выбранный инженер будет закреплён за заявкой. Окно клиента остаётся прежним. Если назначение
          невозможно, действующий план сохранится.
        </p>
        <div className="form-actions">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Проверить переназначение
          </Button>
        </div>
      </form>
    </Modal>
  );
}

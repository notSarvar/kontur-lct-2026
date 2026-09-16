import React, { useState } from 'react';
import { Modal, Field, Button } from '../../components/ui.jsx';
export default function DatasetForm({ onClose, save, busy }) {
  const [id, setId] = useState('southcenter');
  return (
    <Modal
      title="Синтетические данные Билайн"
      subtitle="Три независимых участка, один день — 17.08.2026"
      onClose={onClose}
    >
      <form
        className="modal-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(id);
        }}
      >
        <Field label="Участок">
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="east">Восток · 66 заявок</option>
            <option value="southeast">Юго-восток · 83 заявки</option>
            <option value="southcenter">Югоцентр · 56 заявок</option>
          </select>
        </Field>
        <p>
          Нормативы — из таблицы организаторов. Инженеры синтетические: по навыкам, объёму работ и двум
          сменам. Текущий день и история будут заменены; входные данные можно экспортировать в разделе
          «Заявки».
        </p>
        <p>
          Общественный транспорт и километраж оцениваются по координатам. Адреса без подтверждённой точки
          попадут в очередь диспетчера.
        </p>
        <div className="form-actions">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Загрузить участок
          </Button>
        </div>
      </form>
    </Modal>
  );
}

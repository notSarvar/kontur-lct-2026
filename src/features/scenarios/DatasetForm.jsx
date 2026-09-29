import React, { useEffect, useState } from 'react';
import { Modal, Field, Button } from '../../components/ui.jsx';
import { apiFetch } from '../../shared/api.js';

export default function DatasetForm({ onClose, save, busy }) {
  const [id, setId] = useState('southcenter');
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    apiFetch('/api/datasets', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить список наборов');
        return response.json();
      })
      .then(setDatasets)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  const selected = datasets.find((d) => d.id === id);
  return (
    <Modal
      title="Синтетические данные Билайн"
      subtitle="Независимые наборы заявок с отдельным расчётом плана"
      onClose={onClose}
    >
      <form
        className="modal-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (selected) save(id);
        }}
      >
        <Field label="Участок">
          <select value={id} onChange={(e) => setId(e.target.value)} disabled={busy || !datasets.length}>
            {!datasets.length && <option value="southcenter">Загрузка наборов…</option>}
            {['Исходные наборы', 'Дополнительные дни'].map((label, i) => (
              <optgroup label={label} key={label}>
                {datasets
                  .filter((d) => Boolean(d.baseRegion) === Boolean(i))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.date?.split('-').reverse().join('.')} · {d.count} заявок
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <Button type="button" onClick={() => setRetry((n) => n + 1)}>
              Повторить загрузку
            </Button>
          </div>
        )}
        {selected?.baseRegion && (
          <p>
            Это самостоятельный сценарий. Начальная точка совпадает с офисом исходного участка. Все заявки
            загружаются для нового расчёта; статусы из файла сохраняются как справочные данные. Другие наборы
            с ним не объединяются.
          </p>
        )}
        <p>
          Нормативы — из таблицы организаторов. Инженеры синтетические: по навыкам, объёму работ и двум
          сменам. Текущий день и история будут заменены; входные данные можно сохранить кнопкой «Экспорт JSON»
          в пульте хакатона.
        </p>
        <p>
          Общественный транспорт и километраж оцениваются по координатам. Адреса без подтверждённой точки
          попадут в очередь диспетчера.
        </p>
        <div className="form-actions">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !selected}>
            Загрузить участок
          </Button>
        </div>
      </form>
    </Modal>
  );
}

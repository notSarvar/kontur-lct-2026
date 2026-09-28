import React, { useState } from 'react';
import { Modal, Button, Field } from '../../components/ui.jsx';
import RouteMap from '../../components/RouteMap.jsx';

export default function GeographyPanel({ state, onClose, office, save, busy }) {
  const jobs = state.jobs.filter((j) => !Number.isFinite(j.lat) || !Number.isFinite(j.lng));
  const [id, setId] = useState(jobs[0]?.id || '');
  const [point, setPoint] = useState({ lat: '', lng: '' });
  const [note, setNote] = useState('');
  const job = jobs.find((j) => j.id === id);
  return (
    <Modal
      title="Проверка географии"
      subtitle={(state.geography?.confirmed ?? 0) + ' из ' + state.jobs.length + ' заявок имеют координаты'}
      onClose={onClose}
      wide
      className="geography-dialog"
    >
      <form
        className="geography-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (job) save({ id, lat: Number(point.lat), lng: Number(point.lng), confirmationNote: note });
        }}
      >
        <div className="modal-body form-stack">
          {state.dataset?.office.approximate && (
            <div className="preview-warning">
              <p>{state.dataset.office.assumption}</p>
              <Button type="button" onClick={office}>
                Проверить офис
              </Button>
            </div>
          )}
          {!jobs.length ? (
            <p>
              Координаты всех заявок подготовлены.{' '}
              {state.dataset?.office.approximate ? 'Осталось уточнить офис.' : 'Адресных блокеров нет.'}
            </p>
          ) : (
            <div className="geography-layout">
              <div className="geography-fields form-stack">
                <Field label="Адрес для проверки">
                  <select
                    value={id}
                    onChange={(e) => {
                      setId(e.target.value);
                      setPoint({ lat: '', lng: '' });
                      setNote('');
                    }}
                  >
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        №{j.number} · {j.address}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="geography-address">{job?.address}</p>
                <p className="muted">
                  Выберите здание на карте или введите координаты из проверенного источника. Одинаковые адреса
                  обновятся вместе.
                </p>
                {!!job?.geocodingCandidates?.length && (
                  <Field label="Найденные варианты — требуют проверки">
                    <select
                      key={id}
                      defaultValue=""
                      onChange={(e) => {
                        const c = job.geocodingCandidates[Number(e.target.value)];
                        if (c) setPoint({ lat: c.lat, lng: c.lng });
                      }}
                    >
                      <option value="" disabled>
                        Выберите вариант после проверки
                      </option>
                      {job.geocodingCandidates.map((c, i) => (
                        <option key={i} value={i}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="form-row">
                  <Field label="Широта здания">
                    <input
                      required
                      type="number"
                      step="any"
                      min="-85"
                      max="85"
                      value={point.lat}
                      onChange={(e) => setPoint({ ...point, lat: e.target.value })}
                    />
                  </Field>
                  <Field label="Долгота здания">
                    <input
                      required
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      value={point.lng}
                      onChange={(e) => setPoint({ ...point, lng: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Источник подтверждения">
                  <textarea
                    required
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ссылка на источник или результат проверки с клиентом"
                  />
                </Field>
                <details className="geography-explanation">
                  <summary>Как проверяется точка и время в пути</summary>
                  <p>
                    Совпадение только улицы или магазина не подтверждает адрес дома. {state.plan.roadDetail}
                  </p>
                </details>
              </div>
              <div className="picker-map geography-map">
                <RouteMap
                  picker={
                    point.lat !== '' && point.lng !== ''
                      ? { lat: Number(point.lat), lng: Number(point.lng) }
                      : { lat: 55.75, lng: 37.62 }
                  }
                  onPick={setPoint}
                />
              </div>
            </div>
          )}
        </div>
        <footer className="dialog-actions">
          <Button type="button" onClick={onClose} variant={jobs.length ? '' : 'primary'}>
            {jobs.length ? 'Отмена' : 'Готово'}
          </Button>
          {!!jobs.length && (
            <Button type="submit" loading={busy} variant="primary">
              Проверить план с этой точкой
            </Button>
          )}
        </footer>
      </form>
    </Modal>
  );
}

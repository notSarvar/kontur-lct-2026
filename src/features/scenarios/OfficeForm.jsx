import React, { useState } from 'react';
import { Modal, Field, Button } from '../../components/ui.jsx';
import RouteMap from '../../components/RouteMap.jsx';
export default function OfficeForm({ state, onClose, save, busy }) {
  const office = state.dataset?.office || state.engineers[0].home;
  const [point, setPoint] = useState({ lat: office.lat, lng: office.lng });
  return (
    <Modal title="Офис участка" subtitle={office.address} onClose={onClose}>
      <form
        className="modal-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(point);
        }}
      >
        {office.approximate && <p className="inline-warning">Предварительная точка: {office.assumption}</p>}
        <p>
          Подтвердите стартовую точку. Координаты будут применены ко всем инженерам участка; текущие выезды
          менять нельзя.
        </p>
        <div className="picker-map">
          <RouteMap picker={{ lat: point.lat ?? 55.75, lng: point.lng ?? 37.62 }} onPick={setPoint} />
        </div>
        <div className="form-row">
          <Field label="Широта офиса">
            <input
              type="number"
              step="any"
              required
              min="-85"
              max="85"
              value={point.lat ?? ''}
              onChange={(e) => setPoint({ ...point, lat: +e.target.value })}
            />
          </Field>
          <Field label="Долгота офиса">
            <input
              type="number"
              step="any"
              required
              min="-180"
              max="180"
              value={point.lng ?? ''}
              onChange={(e) => setPoint({ ...point, lng: +e.target.value })}
            />
          </Field>
        </div>
        <div className="form-actions">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Подтвердить точку
          </Button>
        </div>
      </form>
    </Modal>
  );
}

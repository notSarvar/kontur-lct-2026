import React, { useState } from 'react';
import { Shuffle, TriangleAlert } from 'lucide-react';

import { Button, Modal, Field } from '../../components/ui.jsx';

export default function ScenarioForm({ state, onClose, save, busy }) {
  const [count, setCount] = useState(18),
    [engineerCount, setEngineerCount] = useState(state.engineers.length),
    [seed, setSeed] = useState(Math.floor(Math.random() * 100000));
  return (
    <Modal
      title="Новый рабочий день"
      subtitle="Новые входные данные — новый расчёт маршрутов"
      onClose={onClose}
    >
      <form
        className="modal-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save({ count, engineerCount, seed });
        }}
      >
        <div className="scenario-preview">
          <Shuffle size={25} />
          <div>
            <b>Проверьте свой сценарий</b>
            <p>
              День начинается с плановых заявок. Типы работ, адреса, длительность и окна генерируются по seed.
              Срочные заявки поступают отдельно в течение дня.
            </p>
          </div>
        </div>
        <Field label={`Заявок: ${count}`}>
          <input
            type="range"
            min="1"
            max="100"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </Field>
        <Field label={`Инженеров: ${engineerCount}`}>
          <input
            type="range"
            min="1"
            max="40"
            value={engineerCount}
            onChange={(e) => setEngineerCount(Number(e.target.value))}
          />
        </Field>
        <Field label="Seed — число для повторяемого сценария">
          <input
            type="number"
            required
            min="0"
            max="4294967295"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
          />
        </Field>
        <div className="scenario-presets">
          <button
            type="button"
            onClick={() => {
              setCount(12);
              setEngineerCount(4);
            }}
          >
            Спокойный день
          </button>
          <button
            type="button"
            onClick={() => {
              setCount(35);
              setEngineerCount(3);
            }}
          >
            Высокая нагрузка
          </button>
          <button
            type="button"
            onClick={() => {
              setSeed(state.seed);
              setCount(state.jobs.length);
            }}
          >
            Повторить seed
          </button>
        </div>
        <p className="inline-warning">
          <TriangleAlert size={16} />
          Текущий день, отчёты и история заменятся. Время вернётся к 08:00. Перед заменой можно экспортировать
          входные данные кнопкой «Экспорт JSON» в пульте хакатона.
        </p>
        <div className="form-actions">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" icon={Shuffle} variant="primary" disabled={busy}>
            Сгенерировать день
          </Button>
        </div>
      </form>
    </Modal>
  );
}

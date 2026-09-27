import React from 'react';
import { Layers3, Plus, Shuffle, Zap, SlidersHorizontal, Pause, Play } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { time } from '../../shared/format.js';
export default function DemoTools({ state, open, act, busy, running, setRunning, speed, setSpeed }) {
  const urgent = () => open({ type: 'newJob', urgent: true });
  return (
    <section className="simulation">
      <div className="simulation-top">
        <div className="simulation-title">
          <span className="simulation-icon">
            <SlidersHorizontal size={19} />
          </span>
          <div>
            <h3>Лаборатория рабочего дня</h3>
            <p>Время симуляции · передвижение и выполнение заявок</p>
          </div>
        </div>
        <div className="simulation-actions">
          <Button icon={Layers3} onClick={() => open({ type: 'dataset' })}>
            Данные Билайн
          </Button>
          <Button icon={Plus} onClick={() => open({ type: 'random' })}>
            Случайные заявки
          </Button>
          <Button icon={Shuffle} onClick={() => open({ type: 'generate' })}>
            Новый сценарий
          </Button>
          <Button icon={Zap} onClick={urgent}>
            Срочная заявка
          </Button>
        </div>
      </div>
      <div className="simulation-controls">
        <button
          className={`play-button ${running ? 'playing' : ''}`}
          aria-label={running ? 'Пауза симуляции' : 'Запустить симуляцию'}
          onClick={() => setRunning(!running)}
          disabled={state.time >= 1440}
        >
          {running ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className="simulation-clock">
          {time(state.time)}
          <small>{running ? 'Симуляция идёт' : 'На паузе'}</small>
        </div>
        <div className="slider-wrap">
          <input
            aria-label="Время рабочего дня"
            type="range"
            min="480"
            max="1440"
            step="5"
            value={state.time}
            disabled={busy}
            style={{ '--progress': `${((state.time - 480) / 960) * 100}%` }}
            onChange={(e) => {
              setRunning(false);
              act('clock', { time: Number(e.target.value) });
            }}
          />
          <div className="slider-labels">
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>24:00</span>
          </div>
        </div>
        <select
          aria-label="Скорость симуляции"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value="1">1 мин / шаг</option>
          <option value="5">5 мин / шаг</option>
          <option value="15">15 мин / шаг</option>
        </select>
        <Button
          onClick={() => act('clock', { time: Math.min(1440, state.time + 30) })}
          disabled={busy || state.time >= 1440}
        >
          +30 мин
        </Button>
      </div>
    </section>
  );
}

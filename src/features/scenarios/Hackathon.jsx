import { apiFetch } from '../../shared/api.js';
import React, { useRef } from 'react';
import { ArrowUpFromLine, Download, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import Analytics from '../analytics/Analytics.jsx';
import DemoTools from './DemoTools.jsx';

export default function Hackathon({ state, open, act, busy, running, setRunning, speed, setSpeed, onError }) {
  const fileRef = useRef();
  async function exportFile() {
    try {
      const response = await apiFetch('/api/export');
      if (!response.ok) throw new Error('Не удалось выгрузить сценарий');
      const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kontur-scenario-${state.seed}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (error) {
      onError(error.message);
    }
  }
  return (
    <div className="demo-page">
      <div className="demo-heading">
        <SlidersHorizontal size={22} />
        <div>
          <h1>Пульт демонстрации</h1>
          <p>
            Сценарии, симуляция дня и сравнение алгоритмов. Изменения сразу видны в интерфейсе диспетчера.
          </p>
        </div>
      </div>
      {state.dataset && (
        <div className="dataset-banner">
          <span>
            <b>{state.dataset.name}</b> · {state.dataset.date} · {state.jobs.length} заявок ·{' '}
            {state.engineers.length} синтетических инженеров.{' '}
            {state.dataset.office.approximate && 'Точка офиса предварительная.'}
          </span>
          <Button onClick={() => open({ type: 'office' })}>Офис участка</Button>
          <Button onClick={() => open({ type: 'geography' })}>
            География: {state.geography?.issues.length || 0} на проверке
          </Button>
        </div>
      )}
      <DemoTools {...{ state, open, act, busy, running, setRunning, speed, setSpeed }} />
      <div className="demo-data-actions">
        <Button icon={Download} onClick={exportFile}>
          Экспорт JSON
        </Button>
        <Button icon={ArrowUpFromLine} onClick={() => fileRef.current.click()}>
          Импорт
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (file) {
              try {
                open({ type: 'import', data: JSON.parse(await file.text()) });
              } catch {
                onError('Не удалось прочитать JSON');
              }
            }
          }}
        />
      </div>
      <Analytics state={state} demo />
    </div>
  );
}

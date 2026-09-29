import React, { useEffect, useState } from 'react';
import { CheckCheck, X } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import './first-plan-notice.css';

const storageKey = 'kontur:first-plan-reviewed';
const remembered = () => {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
};
export default function FirstPlanNotice({ state, visible, onReview }) {
  const [dismissed, setDismissed] = useState(remembered);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === storageKey || event.key === null) setDismissed(remembered());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const result = state.firstPlanResult;
  // Later replans replace the plan marker, so an old first result is never
  // presented as the current plan when a dispatcher returns to the overview.
  if (!visible || !result || state.plan.initialResultId !== result.id || dismissed === result.id) return null;
  const percent = result.total ? Math.round((result.assigned / result.total) * 100) : 0;
  const dismiss = () => {
    setDismissed(result.id);
    try {
      localStorage.setItem(storageKey, result.id);
    } catch {
      /* Keep the in-memory acknowledgement. */
    }
  };
  return (
    <aside
      className="first-plan-notice"
      aria-label="Результат первого расчёта"
      onKeyDown={(event) => {
        if (event.key === 'Escape') dismiss();
      }}
    >
      <header>
        <span className="first-plan-icon">
          <CheckCheck size={19} />
        </span>
        <h2>Первый план готов</h2>
        <button className="first-plan-close" aria-label="Закрыть результаты расчёта" onClick={dismiss}>
          <X size={17} />
        </button>
      </header>
      <div aria-live="polite">
        <div className="first-plan-score">
          <strong>{percent}%</strong>
          <span>
            заявок в маршрутах
            <b>
              {result.assigned} из {result.total}
            </b>
          </span>
        </div>
        <div className="first-plan-bar" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>
        <dl>
          <div>
            <dt>Без назначения</dt>
            <dd>{result.unassigned}</dd>
          </div>
          <div>
            <dt>Инженеров в плане</dt>
            <dd>{result.usedEngineers}</dd>
          </div>
        </dl>
      </div>
      <p>Проверьте маршруты и назначения. Если нужно, скорректируйте план вручную.</p>
      <Button
        variant="primary"
        onClick={() => {
          dismiss();
          onReview();
        }}
      >
        Проверить план
      </Button>
    </aside>
  );
}

import { apiFetch } from '../../shared/api.js';
import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock3, Loader2, Users } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { duration, time } from '../../shared/format.js';
import './engineer-recommendations.css';
import RecommendationGantt from './RecommendationGantt.jsx';

export default function EngineerRecommendations({ form, state, selected, onSelect, busy }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const inputKey = JSON.stringify(
    Object.fromEntries(
      [
        'id',
        'title',
        'address',
        'lat',
        'lng',
        'type',
        'windowStart',
        'windowEnd',
        'duration',
        'skills',
        'equipment',
        'priority',
        'requiredTransport',
        'contact',
      ].map((key) => [key, form[key]]),
    ),
  );
  const requestKey = `${state.revision}:${inputKey}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch('/api/engineer-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job: JSON.parse(inputKey), expectedRevision: state.revision }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось подобрать инженеров');
        if (!controller.signal.aborted) {
          setResult({ ...data, requestKey });
          setLoading(false);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey]);
  const fresh = result?.requestKey === requestKey;
  return (
    <section className="engineer-recommendations" aria-label="Автоподбор инженеров" aria-busy={loading}>
      <div className="recommendations-heading">
        <div>
          <h3>
            <Users size={18} /> Рекомендуемые инженеры
          </h3>
          <p>
            До трёх вариантов: сначала раньше начать срочную работу, затем меньше сдвигов текущих визитов и
            дополнительной дороги.
          </p>
        </div>
      </div>
      <p className="recommendations-note">
        Проверяем навыки, оборудование, транспорт, смену, перерыв и клиентские окна. Текущий выезд
        сохраняется; другие заявки не снимаются с инженеров.
      </p>
      {(loading || (!fresh && !error)) && (
        <p className="recommendations-status" role="status">
          <Loader2 size={16} className="spin" /> Проверяем маршруты инженеров…
        </p>
      )}
      {error && (
        <div className="recommendations-error" role="alert">
          <p>{error}</p>
          <Button type="button" onClick={() => setRetry((n) => n + 1)}>
            Повторить подбор
          </Button>
        </div>
      )}
      {fresh && (
        <>
          <div className="recommendation-cards">
            {result.candidates.map((c, index) => (
              <article
                key={c.engineerId}
                className={`recommendation-card ${selected === c.engineerId ? 'selected' : ''}`}
              >
                <div className="recommendation-title">
                  <span>{index + 1}</span>
                  <h4>{c.name}</h4>
                  {selected === c.engineerId && <Check size={17} />}
                </div>
                <div className="recommendation-arrival">
                  <Clock3 size={16} />
                  <span>
                    Начало <b>{time(c.start)}</b>
                    <small>
                      Прибытие {time(c.arrival)} · дорога {duration(c.travel)}
                    </small>
                  </span>
                </div>
                <RecommendationGantt key={requestKey} candidate={c} jobId={result.jobId} />
                <dl>
                  <div>
                    <dt>Освободится / доступен</dt>
                    <dd>{time(c.availableAt)}</dd>
                  </div>
                  <div>
                    <dt>Визитов перед срочным</dt>
                    <dd>{c.jobsBefore}</dd>
                  </div>
                  <div>
                    <dt>Сдвинутся позже</dt>
                    <dd>{c.delayedJobs ? `${c.delayedJobs} · суммарно ${duration(c.totalDelay)}` : 'Нет'}</dd>
                  </div>
                  <div>
                    <dt>Дополнительная дорога</dt>
                    <dd>
                      {c.extraTravel > 0 ? '+' : ''}
                      {Math.round(c.extraTravel)} мин
                    </dd>
                  </div>
                </dl>
                <p className="recommendation-reason">
                  {c.activeJobId ? 'После текущего выезда. ' : ''}Все визиты остаются в допустимых окнах.
                </p>
                <Button
                  type="button"
                  variant={selected === c.engineerId ? 'primary' : undefined}
                  disabled={busy}
                  aria-pressed={selected === c.engineerId}
                  onClick={() => selection.current(c.engineerId)}
                >
                  {selected === c.engineerId ? 'Выбран' : `Выбрать ${c.name}`}
                </Button>
              </article>
            ))}
          </div>
          {!result.candidates.length ? (
            <p className="recommendations-empty" role="status">
              Нет подходящего варианта без нарушения текущего плана. Проверьте адрес, согласуйте другое окно
              или измените доступные ресурсы.
            </p>
          ) : result.candidates.length < 3 ? (
            <p className="recommendations-note">
              Подходящих инженеров: {result.candidates.length} из {result.checkedCount}. Остальные не проходят
              проверку ресурсов или расписания.
            </p>
          ) : (
            <p className="recommendations-note">Показаны 3 из {result.feasibleCount} подходящих инженеров.</p>
          )}
          {selected && !result.candidates.some((c) => c.engineerId === selected) && (
            <p className="recommendations-note">
              Выбранный вручную инженер не входит в текущую тройку. Допустимость назначения проверится в
              предпросмотре.
            </p>
          )}
          <p className="recommendations-note">
            {result.roadSource === 'estimate'
              ? 'Время в пути оценочное.'
              : 'Источник дороги: ' + result.roadSource + '.'}{' '}
            Выбор не меняет рабочий день. После согласования проверьте предпросмотр и нажмите «Применить
            план».
          </p>
        </>
      )}
    </section>
  );
}

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import './onboarding.css';

const steps = [
  {
    title: 'Знакомство с Контуром',
    text: 'За 4 минуты вы проверите план, согласуете срочную заявку и увидите рабочий день инженера. Нажимайте на подсвеченные элементы — это настоящий интерфейс с отдельными учебными данными.',
    next: 'Начать обучение',
  },
  {
    title: 'Весь день в трёх показателях',
    text: 'Здесь видно, сколько заявок в плане, сколько уже выполнено и сколько инженеров занято. Блок «Требует внимания» ниже собирает вопросы для диспетчера.',
    target: '.dispatch-metrics',
    next: 'Далее',
  },
  {
    title: 'Карта маршрутов',
    text: 'Точки — адреса заявок, линии — маршруты инженеров. В обычной работе выберите инженера над картой, чтобы рассмотреть его маршрут.',
    target: '.map-panel .route-map',
    next: 'Посмотреть график',
  },
  {
    title: 'Переключите вид расписания',
    text: 'Нажмите «График». Он показывает работы, дорогу и свободные промежутки каждого инженера на общей шкале времени.',
    target: '[data-tour="graph"]',
    done: (c) => c.timeline,
  },
  {
    title: 'Откройте заявку из плана',
    text: 'Нажмите на подсвеченную работу. Так можно быстро перейти от расписания к подробностям визита.',
    target: '.gantt-job',
    done: (c) => c.modal?.type === 'job',
  },
  {
    title: 'Проверьте условия визита',
    text: 'В карточке есть клиентское окно, длительность, исполнитель и чек-лист работ. Для ручной корректировки используется «Переназначить» с предпросмотром. Теперь разберём срочную заявку.',
    target: '.detail-numbers',
    next: 'К срочной заявке',
  },
  {
    title: 'Перейдите в поддержку',
    text: 'Откройте «Поддержка». Здесь собраны заявки, для которых требуется решение диспетчера. На телефоне выберите раздел в списке.',
    target: '[data-tour="nav-support"], .mobile-workspace-nav',
    done: (c) => c.page === 'support',
  },
  {
    title: 'Согласуйте срочный визит',
    text: 'У клиента восстановление связи. Адрес уже подтверждён: нажмите «Согласовать заявку», чтобы подобрать исполнителя.',
    target: '[data-tour="urgent-approval"]',
    done: (c) => c.modal?.type === 'resolveJob',
  },
  {
    title: 'Выберите инженера',
    text: 'Сервис предлагает до трёх подходящих инженеров. В карточках — время начала, влияние на другие визиты и диаграмма Гантта. Выберите первый вариант.',
    target: '.recommendation-card .button',
    done: () => Boolean(document.querySelector('.recommendation-card.selected')),
  },
  {
    title: 'Зафиксируйте договорённость',
    text: 'Введите результат разговора, например: «Клиент подтвердил время». Так решение останется понятным для команды.',
    target: '.resolution-fields textarea',
    next: 'Продолжить',
    ready: () => (document.querySelector('.resolution-fields textarea')?.value.trim().length || 0) >= 3,
  },
  {
    title: 'Рассчитайте новый вариант',
    text: 'Нажмите «Подтвердить и перепланировать». Сначала сервис покажет последствия изменения — назначение ещё не применено.',
    target: '.form-actions button[type="submit"]',
    done: (c) => c.modal?.type === 'preview',
  },
  {
    title: 'Проверьте изменения',
    text: 'Сравните назначения и маршрут до и после. Предпросмотр позволяет проверить результат до изменения рабочего плана.',
    target: '.preview-summary',
    next: 'К подтверждению',
  },
  {
    title: 'Примените учебный план',
    text: 'Нажмите «Применить план». В этом туре изменится только ваша учебная сессия.',
    target: '[aria-label="Применить план"]',
    done: (c) =>
      !c.modal && c.state.jobs.some((j) => j.priority === 'urgent' && j.status === 'pending' && j.engineerId),
  },
  {
    title: 'Познакомьтесь с командой',
    text: 'Откройте «Команда»: здесь диспетчер проверяет квалификацию, оборудование и доступность инженеров.',
    target: '[data-tour="nav-team"], .mobile-workspace-nav',
    done: (c) => c.page === 'team',
  },
  {
    title: 'Перейдём к приложению инженера',
    text: 'Вы познакомились с веб-версией оператора: проверили план, согласовали срочную заявку и открыли команду. Теперь перейдём к мобильному приложению инженера — посмотрим, как он собирается на смену, едет на выезд и отмечает выполненные работы по SOP.',
    next: 'К приложению инженера',
  },
  {
    title: 'Откройте приложение инженера',
    text: 'Нажмите «Инженер». Он видит ближайшую работу, маршрут к текущему адресу и события диспетчера.',
    target: '[data-tour="engineer-mode"]',
    done: (c) => c.mode === 'engineer',
  },
  {
    title: 'Проверьте комплект на смену',
    text: 'Нажмите «Комплект собран». Список материалов и инструмента составлен по SOP назначенных работ. В симуляции галочки заполнены автоматически.',
    target: '.engineer-kit-summary',
    done: () => Boolean(document.querySelector('.engineer-check')),
  },
  {
    title: 'Чек-лист по регламенту',
    text: 'Материалы и инструмент собраны из SOP работ этого инженера. Зелёные галочки показывают готовность к смене. В симуляции комплект заполнен по умолчанию, а кнопка «Пройти вручную» позволяет потренироваться отдельно.',
    target: '.engineer-check',
    next: 'Посмотреть выезд',
  },
  {
    title: 'Инженер на выезде',
    text: 'Учебный выезд уже начат. На карте — только текущий адрес, рядом доступны телефон клиента и открытие маршрута в картах. Инженер сам отмечает «Я на месте» и начинает работу в окне клиента. Перейдём сразу к работе на объекте, пропустив ожидание в учебном сценарии.',
    target: '.phone-map',
    next: 'На объекте: SOP',
  },
  {
    title: 'Отметьте выполненную работу',
    text: 'На объекте инженер подтверждает условия и отмечает выполненные шаги SOP. Для тренировки мы оставили последний пункт без галочки — отметьте его. Затем «Завершить визит» позволяет выбрать полный, частичный или неуспешный результат и передать его диспетчеру. Полное завершение доступно после прохождения SOP.',
    target: '.engineer-check:last-of-type',
    ready: () =>
      Boolean(document.querySelector('.engineer-check input')) &&
      !document.querySelector('.engineer-check input:not(:checked)'),
    next: 'Завершить обучение',
  },
  {
    title: 'Вы готовы к работе',
    text: 'Вы прошли путь от просмотра маршрута до согласования срочной заявки, выезда инженера и заполнения SOP на объекте. В рабочем интерфейсе изменения вступают в силу после вашего подтверждения. Учебные назначения туда не переносятся.',
    finish: true,
  },
];
const visibleElement = (selector) =>
  selector &&
  [...document.querySelectorAll(selector)].find(
    (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden',
  );

export default function OnboardingTour({ context, onTransition, onRestart, busy }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [panelSize, setPanelSize] = useState({ height: 265, viewport: [innerWidth, innerHeight] });
  const panel = useRef(null),
    contextRef = useRef(context),
    advancing = useRef(false);
  contextRef.current = context;
  const step = steps[index];
  useLayoutEffect(() => {
    const measure = () =>
      setPanelSize((old) => {
        const height = panel.current?.offsetHeight || 265;
        return old.height === height && old.viewport[0] === innerWidth && old.viewport[1] === innerHeight
          ? old
          : { height, viewport: [innerWidth, innerHeight] };
      });
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const next = async () => {
    if (advancing.current || index >= steps.length - 1) return;
    advancing.current = true;
    setPreparing(true);
    setError('');
    try {
      await onTransition(index + 1);
      setIndex(index + 1);
    } catch (e) {
      setError(e.message);
      advancing.current = false;
    } finally {
      setPreparing(false);
    }
  };
  useEffect(() => {
    advancing.current = false;
    setRect(null);
    let target;
    const update = () => {
      const el = visibleElement(step.target);
      if (el && target !== el) {
        target = el;
        el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      }
      const box = el?.getBoundingClientRect();
      const nextRect = box
        ? {
            x: Math.max(8, box.left - 5),
            y: Math.max(8, box.top - 5),
            width: Math.min(innerWidth - 16, box.width + 10),
            height: Math.min(innerHeight - 16, box.height + 10),
            bottom: Math.min(innerHeight - 8, box.bottom + 5),
          }
        : null;
      setRect((old) => (JSON.stringify(old) === JSON.stringify(nextRect) ? old : nextRect));
      setReady(step.ready ? step.ready() : true);
      if (step.done?.(contextRef.current)) next();
    };
    update();
    panel.current?.querySelector('button')?.focus({ preventScroll: true });
    const timer = setInterval(update, 180);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [index]);
  useEffect(() => {
    document.body.dataset.onboardingActive = 'true';
    const guard = (event) => {
      const target = visibleElement(steps[index].target);
      if (
        panel.current?.contains(event.target) ||
        ((steps[index].done || steps[index].ready) && target?.contains(event.target)) ||
        event.target.closest?.('.onboarding-banner')
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const keyboard = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== 'Tab') return;
      const target = steps[index].done || steps[index].ready ? visibleElement(steps[index].target) : null;
      const selectors =
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';
      const targets = [
        ...(target?.matches(selectors) ? [target] : []),
        ...(target?.querySelectorAll(selectors) || []),
        ...(panel.current?.querySelectorAll(selectors) || []),
      ].filter((el) => el.getClientRects().length);
      if (!targets.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = targets.indexOf(document.activeElement);
      targets[(current + (event.shiftKey ? -1 : 1) + targets.length) % targets.length]?.focus();
    };
    document.addEventListener('click', guard, true);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      delete document.body.dataset.onboardingActive;
      document.removeEventListener('click', guard, true);
      document.removeEventListener('keydown', keyboard, true);
    };
  }, [index]);
  const restart = async () => {
    setRestarting(true);
    setError('');
    try {
      await onRestart();
      setIndex(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setRestarting(false);
    }
  };
  const width = Math.min(352, window.innerWidth - 32);
  const height = panelSize.height;
  let top = (window.innerHeight - height) / 2;
  let left = (window.innerWidth - width) / 2;
  if (rect) {
    left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.x));
    top =
      rect.bottom + height + 24 < window.innerHeight
        ? rect.bottom + 16
        : rect.y - height - 44 > 8
          ? rect.y - height - 44
          : window.innerHeight - height - 16;
    if (rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.5)
      top = window.innerHeight - height - 16;
  }
  return (
    <div className="onboarding-tour">
      <div
        className="onboarding-shade"
        style={
          rect
            ? {
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.x}px ${rect.y}px, ${rect.x}px ${rect.bottom}px, ${Math.min(window.innerWidth - 8, rect.x + rect.width)}px ${rect.bottom}px, ${Math.min(window.innerWidth - 8, rect.x + rect.width)}px ${rect.y}px, ${rect.x}px ${rect.y}px)`,
              }
            : undefined
        }
      />
      {rect && (
        <div
          className="onboarding-spotlight"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: Math.max(10, rect.bottom - rect.y) }}
        >
          <span className="onboarding-pointer">
            <ArrowDown size={20} />
            {step.done || step.ready ? 'Здесь' : 'Посмотрите'}
          </span>
        </div>
      )}
      <section
        className="onboarding-tip"
        ref={panel}
        style={{ left, top: Math.max(16, top), width }}
        aria-label="Обучение диспетчера"
      >
        <div className="onboarding-tip-top">
          <span>{step.finish ? 'Обучение пройдено' : `Шаг ${index + 1} из ${steps.length}`}</span>
          <a href="/" aria-label="Выйти из обучения">
            <X size={18} />
          </a>
        </div>
        <div className="onboarding-progress" aria-label="Прогресс обучения">
          <i style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div aria-live="polite">
          <h2>
            {step.finish && <Check size={21} />}
            {step.title}
          </h2>
          <p>{step.text}</p>
        </div>
        {error && <p role="alert">{error}</p>}
        {step.next && (
          <Button variant="primary" disabled={!ready || busy || restarting || preparing} onClick={next}>
            {step.next}
            <ArrowRight size={15} />
          </Button>
        )}
        {step.target && !rect && <p className="onboarding-wait">Ждём появления элемента…</p>}
        {step.done && rect && <p className="onboarding-task">Выполните действие в подсвеченной области</p>}
        {step.finish && (
          <a className="button primary" href="/">
            Открыть рабочий интерфейс <ArrowRight size={15} />
          </a>
        )}
        <button className="onboarding-restart" onClick={restart} disabled={busy || restarting || preparing}>
          <RotateCcw size={13} />
          {restarting ? 'Подготовка…' : 'Начать заново'}
        </button>
      </section>
    </div>
  );
}

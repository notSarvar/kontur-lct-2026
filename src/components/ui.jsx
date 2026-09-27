import React, { useEffect, useRef } from 'react';
import { Bell, Check, Route, TriangleAlert, X } from 'lucide-react';
import { time, initials } from '../shared/format.js';

export function Button({ children, icon: Icon, variant = '', className = '', ...props }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}

export function Avatar({ engineer, size = 'normal' }) {
  return <span className={`avatar ${size}`}>{initials(engineer.name)}</span>;
}

export function Badge({ children, tone = 'gray' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Modal({ title, subtitle, onClose, children, wide = false, className = '' }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = React.useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const handler = (e) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const targets = [
          ...dialog.current.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
        const first = targets[0],
          last = targets.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === dialog.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? 'wide' : ''} ${className}`}
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Field({ label, children, hint }) {
  const id = React.useId();
  return (
    <label className="field" htmlFor={id}>
      <span id={`${id}-label`}>{label}</span>
      {React.cloneElement(children, { id, 'aria-labelledby': `${id}-label` })}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Metric({ icon: Icon, label, value, detail, color, onClick }) {
  const Element = onClick ? 'button' : 'div';
  return (
    <Element className={`metric ${onClick ? 'metric-link' : ''}`} onClick={onClick}>
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${color}`}>
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Element>
  );
}

export function Empty({ text }) {
  return (
    <div className="empty">
      <Route size={28} />
      <p>{text}</p>
    </div>
  );
}

export function Event({ event: e }) {
  return (
    <div className={`event ${e.kind}`}>
      <span className="event-symbol">
        {e.kind === 'warning' ? (
          <TriangleAlert size={16} />
        ) : e.kind === 'success' ? (
          <Check size={16} />
        ) : (
          <Bell size={16} />
        )}
      </span>
      <div>
        <b>{e.title}</b>
        <p>{e.detail}</p>
      </div>
      <time>{time(e.time)}</time>
    </div>
  );
}

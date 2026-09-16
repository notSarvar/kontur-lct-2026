import React, { useEffect } from 'react';
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
  return (
    <span className={`avatar ${size}`} style={{ '--person': engineer.color }}>
      {initials(engineer.name)}
    </span>
  );
}

export function Badge({ children, tone = 'gray' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'wide' : ''}`}>
        <header>
          <div>
            <h2>{title}</h2>
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

export function Metric({ icon: Icon, label, value, detail, color }) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${color}`}>
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
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

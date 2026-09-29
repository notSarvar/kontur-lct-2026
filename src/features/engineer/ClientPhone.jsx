import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '../../components/ui.jsx';

export const DEMO_CLIENT_PHONE = '+7 ххх хх хх';

// The public demo uses HTTP, where the modern clipboard API is unavailable.
function copyOnHttp(text) {
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(field);
  try {
    field.focus();
    field.select();
    return document.execCommand('copy');
  } finally {
    field.remove();
    previous?.focus({ preventScroll: true });
  }
}
export default function ClientPhone() {
  const [status, setStatus] = useState('');
  const copy = async () => {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(DEMO_CLIENT_PHONE);
        copied = true;
      } catch {
        /* Fall back for HTTP and clipboard permission restrictions. */
      }
    }
    if (!copied) {
      try {
        copied = copyOnHttp(DEMO_CLIENT_PHONE);
      } catch {
        /* Show a manual-copy hint. */
      }
    }
    setStatus(copied ? 'Номер скопирован' : 'Не удалось скопировать. Выделите номер и скопируйте вручную.');
  };
  return (
    <div className="engineer-client-phone">
      <span>Телефон клиента · демо</span>
      <div className="engineer-client-phone-row">
        <strong>{DEMO_CLIENT_PHONE}</strong>
        <Button icon={Copy} onClick={copy}>
          Скопировать
        </Button>
      </div>
      {status && <p role="status">{status}</p>}
    </div>
  );
}

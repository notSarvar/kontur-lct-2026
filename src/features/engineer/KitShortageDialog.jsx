import React from 'react';
import { Modal, Button } from '../../components/ui.jsx';
import { affectedKitJobs } from '../../shared/kit-shortage.js';

export default function KitShortageDialog({ state, ticket, busy, act, onClose }) {
  const engineer = state.engineers.find((e) => e.id === ticket.engineerId);
  const affected = affectedKitJobs(state, ticket.engineerId, ticket.missing);
  const resolve = async (decision) => {
    if (
      await act(
        'engineer.kit.resolve',
        { id: ticket.id, decision, expectedRevision: state.revision },
        'Решение передано инженеру',
      )
    )
      onClose();
  };
  return (
    <Modal title="Маршрут под риском" subtitle={engineer?.name} onClose={onClose}>
      <div className="modal-body form-stack">
        <p>Инженер сообщил о неполном комплекте. Новые выезды приостановлены до вашего решения.</p>
        <h3>Не хватает</h3>
        <ul>
          {ticket.missing.map((item) => (
            <li key={item.key}>
              <b>{item.label}</b> · {item.quantity}
              <br />
              <small>{item.sources.join(' · ')}</small>
            </li>
          ))}
        </ul>
        <h3>Затронутые заявки · {affected.length}</h3>
        {affected.length ? (
          <ul>
            {affected.map((job) => (
              <li key={job.id}>
                №{job.number} · {job.address}
                <br />
                <small>{job.title}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>Среди текущих назначений нет незавершённых работ с этими требованиями.</p>
        )}
        <p>
          Связь определена по материалам и инструментам в SOP. Заявки без регламента требуют отдельной
          проверки.
        </p>
        {ticket.status === 'open' ? (
          <>
            <Button disabled={busy} variant="primary" onClick={() => resolve('confirm')}>
              Материалы есть — подтвердить
            </Button>
            <small>Подтверждаются перечисленные позиции. Назначения и время работ сохраняются.</small>
            <Button disabled={busy || !affected.length} onClick={() => resolve('skip')}>
              Отложить затронутые заявки
            </Button>
            <small>
              Эти работы уйдут в поддержку. Остальные останутся в планировании; сначала откроется
              предпросмотр.
            </small>
            <Button disabled={busy} onClick={() => resolve('withdraw')}>
              Снять со смены и пересчитать
            </Button>
            <small>
              Оставшиеся работы будут перераспределены. Неразмещённые заявки попадут в очередь диспетчера.
              Изменения вступят в силу после применения плана.
            </small>
          </>
        ) : (
          <p role="status">Обращение уже обработано.</p>
        )}
      </div>
    </Modal>
  );
}

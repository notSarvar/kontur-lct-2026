import { assert } from './validation.js';
import { addEvent } from './scenario.js';
import { shiftKit } from '../../src/shared/shift-kit.js';
import { openKitShortage, affectedKitJobs } from '../../src/shared/kit-shortage.js';

export function kitShortageAction(state, type, p) {
  assert(p.expectedRevision === state.revision, 'Данные изменились. Обновите экран и повторите действие');
  if (type === 'engineer.kit.submit') {
    const engineer = state.engineers.find((e) => e.id === p.id);
    assert(engineer && !engineer.shiftWithdrawn, 'Инженер недоступен для смены');
    assert(!openKitShortage(state, engineer.id), 'Недостача уже передана диспетчеру');
    assert(
      !state.jobs.some((j) => j.engineerId === engineer.id && ['enroute', 'working'].includes(j.status)),
      'Сообщить о комплекте можно до выезда или после завершения текущего визита',
    );
    const kit = shiftKit(state, engineer);
    const missing = kit.items.filter((item) => !item.done);
    assert(
      missing.length > 0 && p.confirmMissing === true,
      'Не все материалы указаны. Подтвердите отправку недостачи',
    );
    const affected = affectedKitJobs(state, engineer.id, missing);
    const ticket = {
      id: crypto.randomUUID(),
      kind: 'kit_shortage',
      engineerId: engineer.id,
      status: 'open',
      time: state.time,
      missing: structuredClone(missing),
      affectedJobIds: affected.map((j) => j.id),
      text: `Маршрут под риском: не хватает ${missing.map((i) => i.label).join(', ')}.`,
    };
    state.support.unshift(ticket);
    addEvent(state, 'Маршрут инженера под риском', `${engineer.name}: ${ticket.text}`, null, 'warning');
    state.history.push({
      type,
      engineerId: engineer.id,
      ticketId: ticket.id,
      missing: ticket.missing,
      time: state.time,
    });
    return;
  }
  const ticket = state.support.find((t) => t.id === p.id && t.kind === 'kit_shortage');
  assert(ticket?.status === 'open', 'Обращение уже обработано или недоступно');
  const engineer = state.engineers.find((e) => e.id === ticket.engineerId);
  assert(engineer, 'Инженер не найден');
  assert(['confirm', 'skip', 'withdraw'].includes(p.decision), 'Выберите решение диспетчера');
  const before = shiftKit(state, engineer);
  const affected = affectedKitJobs(state, engineer.id, ticket.missing);
  const active = state.jobs.filter(
    (j) => j.engineerId === engineer.id && ['enroute', 'working'].includes(j.status),
  );
  assert(!active.length, 'Сначала завершите текущий визит инженера');
  engineer.kitChecks ??= {};
  if (p.decision === 'confirm') {
    const keys = new Set(ticket.missing.map((i) => i.key));
    for (const item of before.items) if (keys.has(item.key)) engineer.kitChecks[item.key] = item.signature;
    engineer.missingKitKeys = (engineer.missingKitKeys || []).filter((key) => !keys.has(key));
  } else {
    engineer.missingKitKeys = [
      ...new Set([...(engineer.missingKitKeys || []), ...ticket.missing.map((i) => i.key)]),
    ];
    if (p.decision === 'withdraw') {
      engineer.shiftWithdrawn = true;
      for (const job of state.jobs)
        if (job.status === 'pending' && job.pinnedEngineerId === engineer.id) job.pinnedEngineerId = null;
    } else {
      for (const job of affected) {
        job.status = 'blocked';
        job.engineerId = null;
        job.pinnedEngineerId = null;
        state.support.push({
          id: crypto.randomUUID(),
          jobId: job.id,
          kind: 'material_job',
          time: state.time,
          status: 'open',
          text: 'Работа отложена диспетчером: отсутствуют материалы или инструменты по SOP.',
        });
      }
    }
  }
  // Removing jobs reduces required quantities. Already packed remaining items stay packed.
  const packed = new Set(before.items.filter((i) => i.done).map((i) => i.key));
  for (const item of shiftKit(state, engineer).items)
    if (packed.has(item.key)) engineer.kitChecks[item.key] = item.signature;
  ticket.status = 'resolved';
  ticket.decision = p.decision;
  ticket.resolvedAt = state.time;
  ticket.resolvedJobIds = affected.map((j) => j.id);
  const label = {
    confirm: 'Наличие материалов подтверждено',
    skip: 'Работы без материалов отложены',
    withdraw: 'Инженер снят со смены',
  }[p.decision];
  addEvent(state, label, engineer.name, engineer.id, p.decision === 'confirm' ? 'success' : 'warning');
  state.history.push({
    type,
    ticketId: ticket.id,
    engineerId: engineer.id,
    decision: p.decision,
    jobIds: ticket.resolvedJobIds,
    time: state.time,
  });
}

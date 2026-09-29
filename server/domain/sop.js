import fs from 'node:fs';
import { assert } from './validation.js';
const standards = JSON.parse(
  fs.readFileSync(new URL('../../data/sop/templates.json', import.meta.url), 'utf8'),
);
export const sopMinutes = (sop) => sop.steps.reduce((sum, s) => sum + s.minutes, 0);
export function validateSop(input) {
  assert(input && typeof input === 'object', 'Укажите регламент');
  const text = (v, max = 3000) => {
    assert(typeof v === 'string' && v.length <= max, 'Проверьте текст регламента');
    return v.trim();
  };
  assert(input.title?.trim(), 'Укажите название регламента');
  assert(
    Array.isArray(input.steps) && input.steps.length > 0 && input.steps.length <= 30,
    'Регламент: 1–30 шагов',
  );
  const steps = input.steps.map((s) => {
    assert(typeof s.id === 'string' && s.id.length > 0 && s.id.length < 100, 'Проверьте ID шага');
    assert(s.text?.trim(), 'Укажите действие');
    assert(
      Number.isInteger(s.minutes) && s.minutes >= 0 && s.minutes <= 480,
      'Время шага: 0–480 целых минут',
    );
    return { id: s.id, text: text(s.text), minutes: s.minutes };
  });
  assert(new Set(steps.map((s) => s.id)).size === steps.length, 'Шаги должны иметь разные ID');
  const list = (items) => {
    assert(Array.isArray(items) && items.length <= 40, 'Проверьте перечень ресурсов');
    return items.map((v) => text(v));
  };
  return {
    title: text(input.title, 180),
    scope: text(input.scope || ''),
    prerequisites: text(input.prerequisites || ''),
    result: text(input.result || ''),
    escalation: text(input.escalation || ''),
    materials: list(input.materials || []),
    tools: list(input.tools || []),
    steps,
  };
}
export function sopCopy(template) {
  return {
    ...structuredClone(template),
    templateId: template.id,
    prerequisitesConfirmed: false,
    steps: template.steps.map((s) => ({ ...s, done: false })),
  };
}
export function defaultSop(job) {
  if (job.type === 'emergency') return 'diagnostics';
  if (job.type === 'connection') return 'connection';
  if (job.type === 'additional' && /роутер/i.test(job.title)) return 'router';
  return null;
}
export function ensureSops(state) {
  state.planningExtensionsVersion = 1;
  state.sopTemplates ??= structuredClone(standards);
  for (const job of state.jobs) {
    if (Object.hasOwn(job, 'sop')) continue;
    const template = state.sopTemplates.find((t) => t.id === defaultSop(job));
    job.sop = template ? sopCopy(template) : null;
  }
  if (state.settings?.autoChecklists !== false) {
    for (const job of state.jobs) {
      if (!job.sop || job.status === 'done') continue;
      job.sop.prerequisitesConfirmed = true;
      for (const step of job.sop.steps) {
        step.done = true;
        step.completedAt ??= state.time;
      }
    }
  }
}
export function sopAction(state, type, p) {
  ensureSops(state);
  assert(
    p.expectedRevision === state.revision,
    'Данные изменились. Обновите карточку перед сохранением регламента.',
  );
  if (type === 'sop.template.save') {
    const template = state.sopTemplates.find((t) => t.id === p.id);
    assert(template, 'Шаблон не найден');
    Object.assign(template, validateSop(p.sop), { version: template.version + 1, edited: true });
    state.history.push({ type, templateId: template.id, version: template.version, time: state.time });
    return;
  }
  const job = state.jobs.find((j) => j.id === p.id);
  assert(job && job.status !== 'done', 'Регламент завершённой заявки доступен только для просмотра');
  if (type === 'job.sop.apply') {
    const template = state.sopTemplates.find((t) => t.id === p.templateId);
    assert(template, 'Шаблон не найден');
    assert(
      state.settings.autoChecklists !== false || !job.sop?.steps.some((s) => s.done),
      'Нельзя заменять регламент с выполненными шагами',
    );
    job.sop = sopCopy(template);
  } else if (type === 'job.sop.save') {
    assert(job.sop, 'Сначала выберите шаблон');
    const valid = validateSop(p.sop),
      old = job.sop.steps;
    valid.steps = valid.steps.map((s) => {
      const previous = old.find((x) => x.id === s.id && x.text === s.text && x.minutes === s.minutes);
      return { ...s, done: previous?.done || false, completedAt: previous?.completedAt ?? null };
    });
    Object.assign(job.sop, valid, { customized: true });
  } else if (type === 'job.sop.check') {
    assert(job.sop, 'Регламент не выбран');
    assert(
      state.settings.autoChecklists === false,
      'Для изменения отметок включите ручное прохождение чек-листов',
    );
    if (p.prerequisitesConfirmed !== undefined) {
      assert(typeof p.prerequisitesConfirmed === 'boolean', 'Проверьте подтверждение условий');
      job.sop.prerequisitesConfirmed = p.prerequisitesConfirmed;
    } else {
      const step = job.sop.steps.find((s) => s.id === p.stepId);
      assert(step && typeof p.done === 'boolean', 'Шаг не найден');
      assert(!p.done || job.sop.prerequisitesConfirmed, 'Сначала подтвердите условия применения регламента');
      step.done = p.done;
      step.completedAt = p.done ? state.time : null;
    }
  }
  state.history.push({
    type,
    jobId: job.id,
    templateId: job.sop?.templateId,
    stepId: p.stepId,
    done: p.done,
    time: state.time,
    sop: type.endsWith('.save') ? structuredClone(job.sop) : undefined,
  });
}

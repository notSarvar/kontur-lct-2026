import { OFFICIAL_POLICY } from './official-policy.js';
import { officialWork } from '../infrastructure/datasets.js';

// Preserve the current staff, manual windows and begun visits. Existing connection
// staff used to include additional orders, so retain that ability explicitly.
export function migrateWorkPolicy(state, norms) {
  if (state.catalogVersion === OFFICIAL_POLICY.version) return false;
  const changes = [];
  for (const engineer of state.engineers) {
    if (engineer.skills.includes('connection') && !engineer.skills.includes('additional'))
      engineer.skills.push('additional');
  }
  for (const job of state.jobs) {
    if (!['pending', 'manual_review'].includes(job.status)) continue;
    const fields = job.source?.fields;
    if (fields?.['Тип заявки BK']) {
      if (job.source.policyVersion === OFFICIAL_POLICY.version) continue;
      const work = officialWork(fields, norms);
      const before = {
        type: job.type,
        duration: job.duration,
        priority: job.priority,
        skills: [...job.skills],
      };
      if (fields['Тип заявки BK'] === 'Глобальная проблема' && fields['Тип заявки HD'] === 'Информация') {
        job.type = work.type;
        job.priority = work.priority;
        // Retain a non-default duration explicitly set by the dispatcher.
        if (job.duration === 80) job.duration = work.duration;
      }
      if (fields['Тип заявки BK'] === 'Дозаказ' && job.skills.length === 1 && job.skills[0] === 'connection')
        job.skills = work.skills;
      job.source = {
        ...job.source,
        normRow: work.normRow,
        policyVersion: OFFICIAL_POLICY.version,
        assumptions: work.assumptions,
        priorityBasis: work.priorityBasis,
      };
      const after = {
        type: job.type,
        duration: job.duration,
        priority: job.priority,
        skills: [...job.skills],
      };
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ jobId: job.id, before, after });
    } else if (job.type === 'additional' && job.skills.length === 1 && job.skills[0] === 'connection') {
      job.skills = ['additional'];
    }
  }
  state.catalogVersion = OFFICIAL_POLICY.version;
  if (state.dataset) state.dataset.policyVersion = OFFICIAL_POLICY.version;
  state.history.push({
    type: 'policy.updated',
    time: state.time,
    version: OFFICIAL_POLICY.version,
    changes,
    comment:
      'BK/HD уточнены. Штат и согласованные окна сохранены; прежний навык подключения разложен на подключение и дозаказ. Начатые и выполненные работы неизменны.',
  });
  return true;
}

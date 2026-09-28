import fs from 'node:fs/promises';
import path from 'node:path';
import { createOfficialScenario } from '../domain/official-scenario.js';
import { replan } from '../application/planning.js';
import { readGeocache, resolvedPoint } from './geocoding.js';
import { hasCoordinates } from '../optimization/travel.js';
import { attachDiff } from '../domain/plan-diff.js';
import { migrateWorkPolicy } from '../domain/policy-migration.js';

export async function loadState(directory) {
  await fs.mkdir(directory, { recursive: true });
  let saved;
  try {
    saved = JSON.parse(await fs.readFile(path.join(directory, 'state.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Хранилище не прочитано: ${error.message}`);
  }
  if (saved?.version === 2) {
    const before = structuredClone(saved);
    const extensionsUpgrade = saved.planningExtensionsVersion !== 1;
    if (extensionsUpgrade)
      await fs.writeFile(
        path.join(directory, `state-before-optimizers-sop-${Date.now()}.backup.json`),
        JSON.stringify(before),
        { flag: 'wx' },
      );
    const norms = JSON.parse(
      await fs.readFile(new URL('../../data/beeline/norms.json', import.meta.url), 'utf8'),
    );
    let refreshed = migrateWorkPolicy(saved, norms);
    if (refreshed)
      await fs.writeFile(
        path.join(directory, `state-before-bk-hd-${Date.now()}.backup.json`),
        JSON.stringify(before),
        { flag: 'wx' },
      );
    refreshed ||= extensionsUpgrade;
    saved.settings.mode ||= 'economy';
    if (saved.dataset) {
      const cache = await readGeocache();
      for (const job of saved.jobs) {
        if (!job.source || hasCoordinates(job)) continue;
        const point = resolvedPoint(job.address, cache);
        if (!point) continue;
        Object.assign(job, point);
        refreshed = true;
        if (job.status === 'manual_review' && job.reviewReason?.code === 'coordinates') {
          job.status = 'pending';
          job.reviewReason = null;
          for (const ticket of saved.support)
            if (ticket.jobId === job.id && ticket.kind === 'scheduling') ticket.status = 'resolved';
        }
      }
    }
    // A restart restores the accepted plan. Re-optimizing here can reassign
    // visits and emit assignment events without a dispatcher action.
    const hasCurrentPlan =
      saved.plan?.at === saved.time &&
      Array.isArray(saved.plan?.routes) &&
      Array.isArray(saved.plan?.unassigned) &&
      saved.plan?.metrics;
    if (!refreshed && hasCurrentPlan) return saved;
    await replan(saved);
    if (refreshed) attachDiff(before, saved);
    else if (before.plan?.diff) {
      saved.plan.diff = before.plan.diff;
      saved.plan.changes = before.plan.diff.jobChanges;
      saved.plan.metrics.changes = saved.plan.changes.length;
    }
    return saved;
  }
  if (saved) {
    // Preserve the old lab before switching to the official domain model.
    await fs.writeFile(
      path.join(directory, `state-v${saved.version || 1}-${Date.now()}.backup.json`),
      JSON.stringify(saved, null, 2),
      { flag: 'wx' },
    );
  }
  const state = await createOfficialScenario('southcenter');
  await replan(state);
  return state;
}
export async function persistState(directory, state) {
  await fs.writeFile(path.join(directory, 'state.tmp'), JSON.stringify(state));
  await fs.rename(path.join(directory, 'state.tmp'), path.join(directory, 'state.json'));
}

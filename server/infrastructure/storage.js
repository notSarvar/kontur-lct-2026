import fs from 'node:fs/promises';
import path from 'node:path';
import { createOfficialScenario } from '../domain/official-scenario.js';
import { replan } from '../application/planning.js';

export async function loadState(directory) {
  await fs.mkdir(directory, { recursive: true });
  let saved;
  try {
    saved = JSON.parse(await fs.readFile(path.join(directory, 'state.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Хранилище не прочитано: ${error.message}`);
  }
  if (saved?.version === 2) {
    await replan(saved);
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

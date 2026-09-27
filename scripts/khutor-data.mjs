import fs from 'node:fs/promises';
import { normalizeOfficialCsv } from '../server/infrastructure/datasets.js';
export const root = new URL('../data/experiments/khutor/', import.meta.url);
export async function inputs() {
  const source = JSON.parse(await fs.readFile(new URL('source.json', root), 'utf8'));
  const bytes = await fs.readFile(new URL('source.csv', root));
  const norms = JSON.parse(await fs.readFile(new URL('../data/beeline/norms.json', import.meta.url), 'utf8'));
  return normalizeOfficialCsv(
    new TextDecoder(source.encoding).decode(bytes),
    { id: source.id, name: source.name, file: source.originalFile },
    norms,
  );
}

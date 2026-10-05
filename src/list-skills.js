import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const skillsSourceDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.claude',
  'skills',
);

export async function listSkills() {
  const entries = await fs.readdir(skillsSourceDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

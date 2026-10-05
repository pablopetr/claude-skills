import fs from 'node:fs/promises';
import path from 'node:path';

export async function listInstalledSkills(projectDir, available) {
  const targetRoot = path.join(projectDir, '.claude', 'skills');
  const entries = await fs.readdir(targetRoot, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isDirectory() && available.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
}

import fs from 'node:fs/promises';
import path from 'node:path';

export async function uninstallSkills({ projectDir, skills, installed }) {
  const result = { removed: [], missing: [] };

  for (const skill of skills) {
    if (!installed.includes(skill)) {
      result.missing.push(skill);
      continue;
    }

    await fs.rm(path.join(projectDir, '.claude', 'skills', skill), { recursive: true, force: true });
    result.removed.push(skill);
  }

  return result;
}

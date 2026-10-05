import fs from 'node:fs/promises';
import path from 'node:path';
import { skillsSourceDir } from './list-skills.js';

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function installSkills({ projectDir, skills, force }) {
  const targetRoot = path.join(projectDir, '.claude', 'skills');
  const result = { installed: [], skipped: [] };

  await fs.mkdir(targetRoot, { recursive: true });

  for (const skill of skills) {
    const target = path.join(targetRoot, skill);

    if ((await exists(target)) && !force) {
      result.skipped.push(skill);
      continue;
    }

    await fs.rm(target, { recursive: true, force: true });
    await fs.cp(path.join(skillsSourceDir, skill), target, { recursive: true });
    result.installed.push(skill);
  }

  return result;
}

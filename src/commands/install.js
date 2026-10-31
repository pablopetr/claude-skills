import fs from 'node:fs/promises';
import path from 'node:path';
import { expandPath } from '../expand-path.js';
import { listSkills } from '../list-skills.js';
import { selectSkills } from '../select-skills.js';
import { promptPath } from '../prompt-path.js';
import { installSkills } from '../install-skills.js';

async function assertDirectory(projectDir) {
  const stats = await fs.stat(projectDir).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(`Directory not found: ${projectDir}`);
  }
}

async function resolveProjectPath(options) {
  if (typeof options.path === 'string') {
    return options.path;
  }

  const claudeDir = await fs.stat(path.join(process.cwd(), '.claude')).catch(() => null);

  return claudeDir?.isDirectory() ? process.cwd() : promptPath();
}

export async function installCommand(options, positional = []) {
  const available = await listSkills();
  const skills = selectSkills(available, {
    ...options,
    skills: options.skills ?? (positional.length > 0 ? positional.join(',') : undefined),
  });
  const rawPath = await resolveProjectPath(options);
  const projectDir = expandPath(rawPath);

  await assertDirectory(projectDir);

  const { installed, skipped } = await installSkills({
    projectDir,
    skills,
    force: options.force === true,
  });

  if (installed.length > 0) {
    console.log(`Installed ${installed.length} skill(s) into ${projectDir}:`);
    installed.forEach((name) => console.log(`  + ${name}`));
  }

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} already installed (use --force to overwrite):`);
    skipped.forEach((name) => console.log(`  = ${name}`));
  }
}

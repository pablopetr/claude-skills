import fs from 'node:fs/promises';
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

export async function installCommand(options) {
  const available = await listSkills();
  const skills = selectSkills(available, options);
  const rawPath = typeof options.path === 'string' ? options.path : await promptPath();
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

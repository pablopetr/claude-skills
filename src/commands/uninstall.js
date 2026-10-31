import fs from 'node:fs/promises';
import { expandPath } from '../expand-path.js';
import { listSkills } from '../list-skills.js';
import { listInstalledSkills } from '../list-installed-skills.js';
import { selectSkills } from '../select-skills.js';
import { uninstallSkills } from '../uninstall-skills.js';

export async function uninstallCommand(options, positional = []) {
  const names = options.skills ?? positional.join(',');

  if (!names) {
    throw new Error('Name the skill(s) to remove, e.g. "claude-skills uninstall react-best-practices".');
  }

  const projectDir = typeof options.path === 'string' ? expandPath(options.path) : process.cwd();
  const stats = await fs.stat(projectDir).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(`Directory not found: ${projectDir}`);
  }

  const available = await listSkills();
  const skills = selectSkills(available, { skills: names });
  const installed = await listInstalledSkills(projectDir, available);
  const { removed, missing } = await uninstallSkills({ projectDir, skills, installed });

  if (removed.length > 0) {
    console.log(`Removed ${removed.length} skill(s) from ${projectDir}:`);
    removed.forEach((name) => console.log(`  - ${name}`));
  }

  if (missing.length > 0) {
    console.log(`Not installed in ${projectDir}:`);
    missing.forEach((name) => console.log(`  = ${name}`));
  }
}

import fs from 'node:fs/promises';
import { expandPath } from '../expand-path.js';
import { listSkills } from '../list-skills.js';
import { listInstalledSkills } from '../list-installed-skills.js';
import { installSkills } from '../install-skills.js';

export async function updateCommand(options) {
  const projectDir = typeof options.path === 'string' ? expandPath(options.path) : process.cwd();
  const stats = await fs.stat(projectDir).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(`Directory not found: ${projectDir}`);
  }

  const available = await listSkills();
  const installed = await listInstalledSkills(projectDir, available);

  if (installed.length === 0) {
    console.log(`No claude-skills skills found in ${projectDir}. Run "claude-skills install" first.`);
    return;
  }

  const { installed: updated } = await installSkills({
    projectDir,
    skills: installed,
    force: true,
  });

  console.log(`Updated ${updated.length} skill(s) in ${projectDir}:`);
  updated.forEach((name) => console.log(`  ~ ${name}`));
}

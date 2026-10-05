import { listSkills } from '../list-skills.js';

export async function listCommand() {
  const skills = await listSkills();
  skills.forEach((name) => console.log(name));
}

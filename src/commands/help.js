const text = `claude-skills - install Claude Code skills into a project

Usage:
  claude-skills install                                   Prompts for the project path, installs all skills
  claude-skills install skills=a,b --path=<dir>           Installs only the listed skills
  claude-skills install except=a,b --path=<dir>           Installs all skills except the listed ones
  claude-skills update [--path=<dir>]                     Refreshes installed skills from claude-skills (defaults to current dir)
  claude-skills list                                   Lists available skills
  claude-skills help                                      Shows this help

Options:
  skills=<names>   Comma-separated skills to install
  except=<names>   Comma-separated skills to leave out
  --path=<dir>     Target project (supports ~)
  --force          Overwrite skills that already exist in the project
`;

export async function helpCommand() {
  console.log(text);
}

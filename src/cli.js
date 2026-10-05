import { parseArgs } from './parse-args.js';
import { installCommand } from './commands/install.js';
import { updateCommand } from './commands/update.js';
import { listCommand } from './commands/list.js';
import { helpCommand } from './commands/help.js';

const commands = {
  install: installCommand,
  update: updateCommand,
  list: listCommand,
  help: helpCommand,
};

export async function run(argv) {
  const { command, options } = parseArgs(argv);
  const handler = commands[command ?? 'help'];

  if (!handler) {
    throw new Error(`Unknown command "${command}". Run "claude-skills help".`);
  }

  await handler(options);
}

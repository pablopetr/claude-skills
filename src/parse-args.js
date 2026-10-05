export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index].replace(/^--?/, '');
    const separator = token.indexOf('=');

    if (separator !== -1) {
      options[token.slice(0, separator)] = token.slice(separator + 1);
      continue;
    }

    const next = rest[index + 1];
    const takesValue = next !== undefined && !next.startsWith('-') && !next.includes('=');

    if (takesValue && token !== 'force') {
      options[token] = next;
      index += 1;
    } else {
      options[token] = true;
    }
  }

  return { command, options };
}

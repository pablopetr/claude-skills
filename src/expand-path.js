import os from 'node:os';
import path from 'node:path';

export function expandPath(input) {
  const trimmed = input.trim().replace(/^["']|["']$/g, '');

  if (trimmed === '~') {
    return os.homedir();
  }

  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }

  return path.resolve(trimmed);
}

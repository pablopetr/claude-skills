import readline from 'node:readline/promises';

export async function promptPath() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = await rl.question('Project path to install skills into: ');

    if (!answer.trim()) {
      throw new Error('A project path is required.');
    }

    return answer;
  } finally {
    rl.close();
  }
}

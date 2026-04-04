import { createInterface } from 'node:readline';
import argon2 from 'argon2';

async function main() {
  const passwordArg = process.argv[2];

  if (passwordArg) {
    const hash = await argon2.hash(passwordArg, { type: argon2.argon2id });
    console.log(hash);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });

  const password = await new Promise<string>((resolve) => {
    rl.question('Enter password: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });

  if (!password.trim()) {
    console.error('Error: password cannot be empty');
    process.exit(1);
  }

  const hash = await argon2.hash(password, { type: argon2.argon2id });
  console.log(hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

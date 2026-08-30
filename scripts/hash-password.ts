import { hashSync } from 'bcryptjs';

/**
 * A small utility so the README can carry a one-line recipe instead of
 * "open a node repl and do...":
 *
 *   npm run hash:password -- 'your-password'
 */
const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash:password -- 'your-password'");
  process.exit(1);
}

console.log(hashSync(password, 10));

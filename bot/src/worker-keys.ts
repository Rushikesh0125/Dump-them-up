// Gives each bot a function-call key limited to the game contract and stores those keys as the
// BOT_KEYS secret of the crank Worker (crank-worker/). Full-access keys never leave this PC.
// Keys are not printed. Usage: npm run worker-keys   (add --balances to only show bot balances)
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { KeyPair, utils } from 'near-api-js';
import { ids, nearConnection, ROOT } from './near';

const near = await nearConnection();
const id = ids();
const bots = await Promise.all(id.bots.map((b) => near.account(b)));
for (const b of bots) {
  const s = await b.state();
  console.log(`${b.accountId}: ${utils.format.formatNearAmount(s.amount.toString(), 3)} NEAR`);
}
if (process.argv.includes('--balances')) process.exit(0);

const keys: Record<string, string> = {};
for (const b of bots) {
  const kp = KeyPair.fromRandom('ed25519');
  await b.addKey(kp.getPublicKey(), id.game, [], undefined); // no allowance cap: bounded by the bot's balance
  keys[b.accountId] = kp.toString();
  console.log(`added game-only key to ${b.accountId}`);
}

const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'BOT_KEYS'], {
  cwd: join(ROOT, 'crank-worker'),
  input: JSON.stringify(keys),
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
});
process.exit(r.status ?? 1);

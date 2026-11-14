// Creates sponsor.<master>, the account that funds new guest/Privy players (0.06 NEAR each), and
// stores its key as the SPONSOR_KEY secret of the crank Worker. Only this account's key goes to
// Cloudflare, so a leak can cost at most its balance. Key is not printed.
// Usage: npm run sponsor            (create if missing + upload key)
//        npm run sponsor -- --top-up 2   (send 2 more NEAR from master)
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { utils } from 'near-api-js';
import { ensureSubAccount, localKeys, MASTER, nearConnection, NETWORK, ROOT } from './near';

const near = await nearConnection();
const id = `sponsor.${MASTER()}`;
const sponsor = await ensureSubAccount(near, id, process.env.SPONSOR_NEAR || '3');
const i = process.argv.indexOf('--top-up');
if (i > 0) {
  const master = await near.account(MASTER());
  await master.sendMoney(id, BigInt(utils.format.parseNearAmount(process.argv[i + 1])!));
}
const s = await sponsor.state();
console.log(`${id}: ${utils.format.formatNearAmount(s.amount.toString(), 3)} NEAR`);
if (i > 0) process.exit(0);

const kp = await localKeys.getKey(NETWORK, id);
const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'SPONSOR_KEY'], {
  cwd: join(ROOT, 'crank-worker'),
  input: JSON.stringify({ account_id: id, private_key: kp.toString() }),
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
});
process.exit(r.status ?? 1);

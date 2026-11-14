// One-shot testnet setup: creates the token and game accounts under your master account, deploys the
// wasm, initialises everything, seeds the pools and vaults, and joins the bot accounts to cartels.
// Safe to re-run: existing accounts and initialised contracts are skipped.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { utils, type Account, type Near } from 'near-api-js';
import { MASTER, ROOT, call, ensureSubAccount, env, ids, nearConnection, unit, view } from './near';

const CARTELS = [
  { key: 'dragon', name: 'Black Dragon', symbol: 'BLACKDRAGON', price: 0.0861, vaultUsd: 48_200 },
  { key: 'shitzu', name: 'Shitzu', symbol: 'SHITZU', price: 0.000651, vaultUsd: 31_000 },
  { key: 'neko', name: 'NEKO', symbol: 'NEKO', price: 0.0536, vaultUsd: 22_700 },
] as const;
const POOL_USD = 1_000_000; // mUSD on each side of every pool: deep enough that single hits barely move price

function wasm(crate: string, file: string) {
  const candidates = [
    join(ROOT, crate, 'target', 'near', `${file}.wasm`),
    join(ROOT, crate, 'target', 'near', file, `${file}.wasm`),
    join(ROOT, crate, 'target', 'wasm32-unknown-unknown', 'release', `${file}.wasm`),
  ];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`Build ${crate} first (see README). Looked in:\n  ${candidates.join('\n  ')}`);
  return readFileSync(found);
}

async function isInitialised(acct: Account, contractId: string, probe: string, args: object = {}) {
  try {
    await view(acct, contractId, probe, args);
    return true;
  } catch {
    return false;
  }
}

async function deployToken(near: Near, master: Account, id: string, name: string, symbol: string, supply: bigint) {
  const acct = await ensureSubAccount(near, id, '2');
  if (await isInitialised(master, id, 'ft_metadata')) return;
  await acct.deployContract(wasm('token', 'dtu_token'));
  await call(acct, id, 'new', { owner_id: MASTER(), total_supply: supply.toString(), name, symbol, decimals: 6 });
  console.log(`  ${symbol} deployed at ${id}`);
}

async function register(master: Account, token: string, account: string) {
  const bal = await view(master, token, 'storage_balance_of', { account_id: account });
  if (!bal) await call(master, token, 'storage_deposit', { account_id: account, registration_only: true }, BigInt(utils.format.parseNearAmount('0.00125')!), 30n);
}

async function send(master: Account, token: string, to: string, amount: bigint, msg: string) {
  await call(master, token, 'ft_transfer_call', { receiver_id: to, amount: amount.toString(), msg }, 1n, 150n);
}

async function main() {
  const near = await nearConnection();
  const master = await near.account(MASTER());
  const id = ids();
  const countSeconds = Number(env('COUNT_SECONDS', '900'));
  console.log(`Master: ${MASTER()}`);

  console.log('1/5 tokens');
  for (const c of CARTELS) {
    const supply = unit((POOL_USD / c.price) * 4 + (c.vaultUsd / c.price) * 4);
    await deployToken(near, master, id.tokens[c.key], c.name, c.symbol, supply);
  }
  await deployToken(near, master, id.tokens.musd, 'Mock USD', 'mUSD', unit(100_000_000));

  console.log('2/5 game contract');
  const game = await ensureSubAccount(near, id.game, '4');
  if (!(await isInitialised(master, id.game, 'get_config'))) {
    await game.deployContract(wasm('contract', 'dump_them_up'));
    await call(game, id.game, 'new', {
      names: CARTELS.map((c) => c.name),
      tokens: CARTELS.map((c) => id.tokens[c.key]),
      musd_token: id.tokens.musd,
      count_seconds: countSeconds,
      faucet_musd: unit(2_500).toString(),
      faucet_tokens: unit(10_000).toString(),
    });
    console.log(`  game deployed at ${id.game} (count = ${countSeconds}s)`);
  }

  console.log('3/5 storage registration');
  for (const t of Object.values(id.tokens)) await register(master, t, id.game);

  console.log('4/5 pools and vaults');
  const g = await view<{ cartels: { value_musd: string }[] }>(master, id.game, 'get_game');
  for (const [i, c] of CARTELS.entries()) {
    if (BigInt(g.cartels[i].value_musd) > 0n) continue;
    await send(master, id.tokens[c.key], id.game, unit(POOL_USD / c.price), 'seed_pool');
    await send(master, id.tokens.musd, id.game, unit(POOL_USD), `seed_pool:${i}`);
    await send(master, id.tokens[c.key], id.game, unit(c.vaultUsd / c.price), 'seed_vault');
    console.log(`  ${c.symbol}: pool $${POOL_USD.toLocaleString()} · vault $${c.vaultUsd.toLocaleString()}`);
  }

  console.log('5/5 bot cartels');
  for (const [i, bot] of id.bots.entries()) {
    const b = await ensureSubAccount(near, bot, '0.5');
    const p = await view(master, id.game, 'get_player', { account_id: bot });
    if (!p) await call(b, id.game, 'join_cartel', { cartel: [0, 1, 2, 1][i] });
  }

  const out = { network: 'testnet', game: id.game, tokens: id.tokens, bots: id.bots, countSeconds };
  writeFileSync(join(ROOT, 'deployment.testnet.json'), JSON.stringify(out, null, 2));
  writeFileSync(join(ROOT, 'web', '.env.local'), `VITE_GAME_CONTRACT=${id.game}\nVITE_NEAR_RPC=${env('NEAR_RPC', 'https://rpc.testnet.fastnear.com')}\n`);
  console.log('\nDone. Wrote deployment.testnet.json and web/.env.local (restart `npm run dev` in web/ to play on testnet)');
  console.log(`Game: https://testnet.nearblocks.io/address/${id.game}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

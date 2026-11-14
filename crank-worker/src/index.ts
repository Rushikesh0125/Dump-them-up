// The count crank as a scheduled Worker. Same job as bot/src/crank.ts, cut into one-minute runs:
// settle the count when it is due, resolve jobs whose raider left, and now and then play a bot turn.
// Bots sign with function-call keys limited to the game contract (secret BOT_KEYS).
// Also serves POST /fund, which gives new guest/Privy players a little NEAR for gas (see fund.ts).
import { Account, Connection, KeyPair, keyStores, providers } from 'near-api-js';
import { handleFund, type FundEnv } from './fund';

interface Env extends FundEnv {
  GAME: string;
  BOTS: string;
  NEAR_RPC: string;
  BOT_TURN_CHANCE: string;
  BOT_KEYS: string;
}
interface Game {
  count_ends_ms: number;
  next_raid: number;
  cartels: { name: string; locked: boolean; shield_tier: number; protection_prices: string[] }[];
}
interface Raid { id: number; resolved: boolean }
interface Player { cartel: number; balances: string[]; open_raid: number | null }

const TGAS = 1_000_000_000_000n;
const TIERS = [0, 0, 1, 1, 2]; // bots favour the cheaper jobs
const STRAGGLER_WINDOW = 10;

const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function accounts(env: Env) {
  const keys = JSON.parse(env.BOT_KEYS) as Record<string, string>;
  const store = new keyStores.InMemoryKeyStore();
  const ids = env.BOTS.split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    if (!keys[id]) throw new Error(`BOT_KEYS has no key for ${id}`);
    await store.setKey('testnet', id, KeyPair.fromString(keys[id] as `ed25519:${string}`));
  }
  const conn = Connection.fromConfig({
    networkId: 'testnet',
    provider: { type: 'JsonRpcProvider', args: { url: env.NEAR_RPC } },
    signer: { type: 'InMemorySigner', keyStore: store },
  });
  return ids.map((id) => new Account(conn, id));
}

const view = <T>(a: Account, contractId: string, methodName: string, args: object = {}) =>
  a.viewFunction({ contractId, methodName, args }) as Promise<T>;

async function call(a: Account, contractId: string, methodName: string, args: object = {}, tgas = 100n) {
  const outcome = await a.functionCall({ contractId, methodName, args, gas: tgas * TGAS, attachedDeposit: 0n });
  return providers.getTransactionLastResult(outcome);
}

async function botTurn(bot: Account, game: string, g: Game, log: string[]) {
  const p = await view<Player | null>(bot, game, 'get_player', { account_id: bot.accountId });
  if (!p) return;
  if (p.open_raid) {
    await call(bot, game, 'resolve_raid', { raid_id: p.open_raid }).catch(() => {});
    return;
  }
  if (Math.random() < 0.15 && g.cartels[p.cartel].shield_tier === 0) {
    const tier = pick([1, 2] as const);
    const chip = BigInt(g.cartels[p.cartel].protection_prices[tier]) / 3n;
    if (chip > 0n && BigInt(p.balances[3]) > chip) {
      await call(bot, game, 'pay_protection', { tier, amount: chip.toString() });
      log.push(`${bot.accountId} chipped into tier ${tier} protection`);
      return;
    }
  }
  const targets = [0, 1, 2].filter((t) => t !== p.cartel && !g.cartels[t].locked);
  if (!targets.length) return;
  const target = pick(targets);
  const tier = pick(TIERS);
  const q = await view<{ cost: string; locked: boolean }>(bot, game, 'get_quote', { target, tier });
  if (q.locked || BigInt(p.balances[3]) < BigInt(q.cost)) return;
  const raid = (await call(bot, game, 'commit_raid', { target, tier })) as { id: number };
  await sleep(1_500); // randomness must come from a later block
  const out = (await call(bot, game, 'resolve_raid', { raid_id: raid.id })) as { win: boolean };
  log.push(`${bot.accountId} hit ${g.cartels[target].name} (tier ${tier}): ${out.win ? 'DUMPED' : 'busted'}`);
}

async function run(env: Env) {
  const log: string[] = [];
  const bots = await accounts(env);
  const crank = bots[0];
  const game = env.GAME;

  let g = await view<Game>(crank, game, 'get_game');
  if (Date.now() >= g.count_ends_ms + 2_000) {
    await call(crank, game, 'settle_count', {}, 300n);
    log.push('the count is in: settled');
    g = await view<Game>(crank, game, 'get_game');
  }

  for (let id = Math.max(1, g.next_raid - STRAGGLER_WINDOW); id < g.next_raid; id++) {
    const r = await view<Raid | null>(crank, game, 'get_raid', { raid_id: id });
    if (r && !r.resolved) {
      try {
        await call(crank, game, 'resolve_raid', { raid_id: id });
        log.push(`resolved straggler job #${id}`);
      } catch (e) {
        if (!String(e).includes('wait one block')) log.push(`could not resolve #${id}: ${String(e).slice(0, 120)}`);
      }
    }
  }

  if (Math.random() < (Number(env.BOT_TURN_CHANCE) || 0)) {
    const bot = pick(bots);
    try {
      await botTurn(bot, game, g, log);
    } catch (e) {
      log.push(`${bot.accountId} turn failed: ${String(e).slice(0, 160)}`);
    }
  }
  return log;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      run(env).then(
        (log) => console.log(log.length ? log.join('\n') : 'nothing to do'),
        (e) => console.error('crank run failed:', String(e).slice(0, 300)),
      ),
    );
  },
  async fetch(req: Request, env: Env) {
    if (new URL(req.url).pathname === '/fund') return handleFund(req, env);
    return new Response('dump-them-up crank', { status: 404 });
  },
};

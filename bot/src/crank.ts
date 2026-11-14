// The crank: settles the count when it is due, resolves jobs whose raider left before the outcome,
// and runs the bot cartels so the street stays busy. Run it while demoing: `npm run crank`.
import type { Account } from 'near-api-js';
import { call, ids, nearConnection, sleep, view } from './near';

interface Game {
  count_ends_ms: number;
  now_ms: number;
  next_raid: number;
  cartels: { name: string; value_musd: string; locked: boolean; shield_tier: number; protection_prices: string[] }[];
}
interface Raid { id: number; resolved: boolean; commit_height: number }
interface Player { cartel: number; balances: string[]; open_raid: number | null; shield?: never }

const BOT_EVERY_MS = [6_000, 14_000];
const TIERS = [0, 0, 1, 1, 2]; // bots favour the cheaper jobs

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function settleIfDue(crank: Account, game: string) {
  const g = await view<Game>(crank, game, 'get_game');
  if (Date.now() >= g.count_ends_ms + 2_000) {
    await call(crank, game, 'settle_count', {}, 0n, 300n);
    log('the count is in: settled');
  }
  return g;
}

async function resolveStragglers(crank: Account, game: string, nextRaid: number) {
  for (let id = Math.max(1, nextRaid - 25); id < nextRaid; id++) {
    const r = await view<Raid | null>(crank, game, 'get_raid', { raid_id: id });
    if (r && !r.resolved) {
      try {
        await call(crank, game, 'resolve_raid', { raid_id: id });
        log(`resolved straggler job #${id}`);
      } catch (e) {
        if (!String(e).includes('wait one block')) log(`could not resolve #${id}:`, String(e).slice(0, 120));
      }
    }
  }
}

async function botTurn(bot: Account, game: string, g: Game) {
  const p = await view<Player | null>(bot, game, 'get_player', { account_id: bot.accountId });
  if (!p) return;
  if (p.open_raid) {
    await call(bot, game, 'resolve_raid', { raid_id: p.open_raid }).catch(() => {});
    return;
  }
  // now and then, chip into protection when the cartel's vault is under pressure
  if (Math.random() < 0.15 && g.cartels[p.cartel].shield_tier === 0) {
    const tier = pick([1, 2] as const);
    const price = BigInt(g.cartels[p.cartel].protection_prices[tier]);
    const chip = price / 3n;
    if (chip > 0n && BigInt(p.balances[3]) > chip) {
      await call(bot, game, 'pay_protection', { tier, amount: chip.toString() });
      log(`${bot.accountId} chipped into tier ${tier} protection`);
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
  await sleep(1_500); // let a block pass
  const out = (await call(bot, game, 'resolve_raid', { raid_id: raid.id })) as { win: boolean };
  log(`${bot.accountId} hit ${g.cartels[target].name} (tier ${tier}): ${out.win ? 'DUMPED' : 'busted'}`);
}

async function main() {
  const near = await nearConnection();
  const id = ids();
  const bots = await Promise.all(id.bots.map((b) => near.account(b)));
  const crank = bots[0];
  log(`crank running for ${id.game} with ${bots.length} bots`);
  let nextBot = Date.now();
  for (;;) {
    try {
      const g = await settleIfDue(crank, id.game);
      await resolveStragglers(crank, id.game, g.next_raid);
      if (Date.now() >= nextBot) {
        await botTurn(pick(bots), id.game, g);
        nextBot = Date.now() + rand(BOT_EVERY_MS[0], BOT_EVERY_MS[1]);
      }
    } catch (e) {
      log('tick failed:', String(e).slice(0, 200));
    }
    await sleep(4_000);
  }
}

main();

// Prints the live game state: vault values, protection, the count, and the latest events.
import { ids, nearConnection, view } from './near';

const usd = (s: string) => '$' + (Number(BigInt(s)) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 });

async function main() {
  const near = await nearConnection();
  const id = ids();
  const acct = await near.account(id.bots[0]);
  const g = await view<any>(acct, id.game, 'get_game');
  console.log(`Game ${id.game} · next count in ${Math.max(0, Math.round((g.count_ends_ms - Date.now()) / 1000))}s · bounty ${usd(g.bounty_musd)}`);
  for (const c of g.cartels) {
    console.log(`  ${c.name.padEnd(13)} vault ${usd(c.value_musd).padStart(9)}  protection T${c.shield_tier}  dumps ${c.dumps}  ${c.locked ? 'LOCKED' : ''}`);
  }
  const events = await view<any[]>(acct, id.game, 'get_events', { limit: 10 });
  console.log('Latest events:');
  for (const e of events) console.log(`  #${e.id} ${e.kind.padEnd(11)} ${e.actor} ${e.from}->${e.target} tier ${e.tier} ${usd(e.amount)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

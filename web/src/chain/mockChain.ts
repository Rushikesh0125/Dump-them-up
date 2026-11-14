// In-browser stand-in for the NEAR contract. Same rules, same formulas, local randomness.
// Replace with the contract client (same GameChain interface) once the contract is deployed.
import { CARTELS, CARTEL_ORDER, ECON, RESPECT_PER_LEVEL, TIERS, type CartelId } from '../game/config';
import { money, quote } from '../game/economy';
import type { ChainSnapshot, GameChain, NewsItem, RaidOutcome, RaidTicket } from './types';

const COUNT_SECONDS = 300; // demo epoch; the contract uses 3600
const BOTS = ['dr4g0n.near', 'ember.near', 'pup.near', 'bonebag.near', 'n3ko.near', 'whisker.near'];
const BOT_CARTEL: Record<string, CartelId> = {
  'dr4g0n.near': 'dragon', 'ember.near': 'dragon', 'pup.near': 'shitzu',
  'bonebag.near': 'shitzu', 'n3ko.near': 'neko', 'whisker.near': 'neko',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PRICE: Record<CartelId, number> = { dragon: 0.12, shitzu: 0.08, neko: 0.05 }; // mUSD per coin

/** Demo-video flags, read from the URL (mock chain only):
 *  ?gate=1      start signed out, so the guest sign-in and cartel pick show
 *  ?win=1|0     force the player's next results (win / bust)
 *  ?count=N     the count lands in N seconds
 *  ?bots=0|fast no bot raids / a bot raid every ~2.5 s
 *  ?cover=1     protection one $50 chip away from switching on */
const DEMO = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const short = (id: CartelId) => CARTELS[id].ticker.slice(1);

export class MockChain implements GameChain {
  private state: ChainSnapshot;
  private listeners = new Set<() => void>();
  private tickets = new Map<number, RaidTicket>();
  private nextId = 1;
  private newsId = 100;

  constructor() {
    this.state = {
      session: DEMO.get('gate') === '1' ? { status: 'disconnected', accountId: null, network: 'mock' } : { status: 'ready', accountId: 'you.testnet', network: 'mock' },
      cartels: {
        dragon: { id: 'dragon', vault: 48200, maxVault: 52000, countStartVault: 48200, heat: 34, protection: 0, members: 312 },
        shitzu: { id: 'shitzu', vault: 31000, maxVault: 34500, countStartVault: 31000, heat: 82, protection: 0, members: 201 },
        neko: { id: 'neko', vault: 22700, maxVault: 24000, countStartVault: 22700, heat: 58, protection: 3, members: 156 },
      },
      player: {
        account: 'you.testnet', cartel: 'dragon', cash: 2500, take: 0,
        respect: 340, level: 7, streak: 2, raids: 9, wins: 5, bigWins: 0,
        protectionPaid: DEMO.get('cover') === '1' ? 270 : 192, protectionPrice: 310,
        holdings: { coin: 'dragon', wallet: 10000, staked: 18400, pending: 0, price: PRICE.dragon, others: [] },
      },
      news: [
        { id: 1, head: 'Black Dragon cartel dumps Shitzu vault for 3.8×', sub: 'dr4g0n.near swapped $285 of $SHITZU into $BLACKDRAGON', bad: false },
        { id: 2, head: 'NEKO hitter busted at Dragon’s door', sub: 'their $75 now sits in the Dragon stash', bad: true },
        { id: 3, head: 'Shitzu heat hits 82%, no protection in sight', sub: 'easy mark, say the regulars', bad: true },
        { id: 4, head: 'NEKO pays for Diamond Hands cover', sub: 'hitters’ odds cut to 0.6× for the hour', bad: false },
        { id: 5, head: 'Shitzu cartel cracks NEKO safe for 9.5×', sub: 'bonebag.near swapped $236 of $NEKO into $SHITZU', bad: false },
        { id: 6, head: 'Whale pays the Hopium Crew $200', sub: 'Dragon protection now 62% paid', bad: false },
      ],
      countEndsAt: Date.now() + (Number(DEMO.get('count')) || COUNT_SECONDS) * 1000,
      dumpsThisCount: { dragon: 14, shitzu: 6, neko: 4 },
    };
    setInterval(() => this.tick(), 1000);
    if (DEMO.get('bots') !== '0') this.scheduleBot();
  }

  getSnapshot = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private commit(mut: (s: ChainSnapshot) => void) {
    const next: ChainSnapshot = structuredClone(this.state);
    mut(next);
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  private push(s: ChainSnapshot, item: Omit<NewsItem, 'id'>) {
    s.news = [{ id: this.newsId++, ...item }, ...s.news].slice(0, 8);
  }

  async commitRaid(target: CartelId, tierId: number): Promise<RaidTicket> {
    await sleep(250);
    const s = this.state;
    const tier = TIERS[tierId];
    if (target === s.player.cartel) throw new Error('A cartel cannot hit itself.');
    const t = s.cartels[target];
    if (t.vault < t.countStartVault * 0.9) throw new Error('Vault locked until the count: it already lost 10% this hour.');
    const q = quote(t.vault, tier, t.protection);
    if (s.player.cash < q.cost) throw new Error('Not enough cash for this job.');
    const ticket: RaidTicket = { id: this.nextId++, target, tierId, cost: q.cost, payout: q.payout, pEff: q.pEff };
    this.tickets.set(ticket.id, ticket);
    this.commit((n) => { n.player.cash -= q.cost; });
    return ticket;
  }

  async resolveRaid(ticketId: number): Promise<RaidOutcome> {
    await sleep(700 + Math.random() * 700); // block time
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error('Unknown job.');
    this.tickets.delete(ticketId);
    const tier = TIERS[ticket.tierId];
    const forced = DEMO.get('win');
    const win = forced === '1' ? true : forced === '0' ? false : Math.random() < ticket.pEff; // the contract reads block randomness here
    const q = quote(this.state.cartels[ticket.target].vault, tier, this.state.cartels[ticket.target].protection);
    let vaultLoss = 0;
    this.commit((n) => {
      const p = n.player;
      const t = n.cartels[ticket.target];
      p.raids += 1;
      t.heat = Math.min(100, t.heat + 5);
      let gain = 10;
      if (win) {
        vaultLoss = q.vaultLossOnWin;
        t.vault -= vaultLoss;
        n.cartels[p.cartel].vault += q.tribute;
        p.take += ticket.payout;
        p.holdings.pending += ticket.payout / PRICE[p.cartel];
        p.wins += 1;
        p.streak += 1;
        if (tier.m > 9) p.bigWins += 1;
        n.dumpsThisCount[p.cartel] += 1;
        gain = tier.m > 9 ? 60 : 25;
        this.push(n, { head: `Black Dragon cartel dumps ${short(ticket.target)} vault for ${tier.label}`, sub: `${p.account} swapped ${money(ticket.payout)} of ${CARTELS[ticket.target].ticker} into $BLACKDRAGON`, bad: false });
      } else {
        t.vault += ticket.cost * (1 - ECON.FEE);
        p.streak = 0;
        this.push(n, { head: `Dragon hitter busted at ${short(ticket.target)} door`, sub: `their ${money(ticket.cost)} bought ${CARTELS[ticket.target].ticker} for the cartel`, bad: true });
      }
      p.respect += gain;
      while (p.respect >= RESPECT_PER_LEVEL) { p.respect -= RESPECT_PER_LEVEL; p.level += 1; }
    });
    return { ticket, win, vaultLoss };
  }

  readonly emailLogin = false;
  connect() {}
  async playAsGuest() {
    await sleep(1200); // "setting up your account"
    this.commit((n) => { n.session = { status: 'no-cartel', accountId: 'anon-7f3a21', network: 'mock' }; });
  }
  async signInWithEmail() {}
  async disconnect() {}
  async joinCartel(cartel: CartelId) {
    await sleep(700);
    this.commit((n) => {
      n.session = { status: 'ready', accountId: 'anon-7f3a21', network: 'mock' };
      n.player.account = 'anon-7f3a21';
      n.player.cartel = cartel;
      n.player.holdings = { coin: cartel, wallet: 10000, staked: 0, pending: 0, price: PRICE[cartel], others: [] };
      n.cartels[cartel].members += 1;
      this.push(n, { head: `anon-7f3a21 joins the ${CARTELS[cartel].name} cartel`, sub: 'fresh muscle on the block', bad: false });
    });
  }

  async payProtection(amount: number): Promise<void> {
    await sleep(250);
    if (this.state.player.cash < amount) throw new Error('Not enough cash.');
    this.commit((n) => {
      const p = n.player;
      p.cash -= amount;
      p.protectionPaid = Math.min(p.protectionPrice, p.protectionPaid + amount);
      if (p.protectionPaid >= p.protectionPrice && n.cartels[p.cartel].protection < 2) {
        n.cartels[p.cartel].protection = 2;
        this.push(n, { head: `${CARTELS[p.cartel].name} switches on Hopium cover`, sub: 'hitters’ odds cut to 0.8× until the count', bad: false });
      }
    });
  }

  private tick() {
    if (Date.now() < this.state.countEndsAt) return;
    this.commit((n) => {
      const p = n.player;
      const take = p.take;
      // loot is the cartel's coin, staked for the player (as in the contract), not cash
      p.holdings.staked = (p.holdings.staked ?? 0) + p.holdings.pending;
      p.holdings.pending = 0;
      p.take = 0;
      for (const id of CARTEL_ORDER) {
        const c = n.cartels[id];
        c.heat = Math.max(5, Math.round(c.heat * 0.6));
        c.maxVault = Math.max(c.vault, c.maxVault * 0.98);
        c.countStartVault = c.vault;
      }
      const boss = CARTEL_ORDER.reduce((a, b) => (n.dumpsThisCount[a] >= n.dumpsThisCount[b] ? a : b));
      this.push(n, { head: `The count is in: ${CARTELS[boss].name} runs the city`, sub: take > 0 ? `your ${money(take)} take is staked in ${CARTELS[p.cartel].ticker}` : 'quiet night for you', bad: false });
      n.dumpsThisCount = { dragon: 0, shitzu: 0, neko: 0 };
      n.countEndsAt = Date.now() + COUNT_SECONDS * 1000;
    });
  }

  private scheduleBot() {
    const fast = DEMO.get('bots') === 'fast';
    setTimeout(() => { this.botRaid(); this.scheduleBot(); }, fast ? 2200 + Math.random() * 800 : 7000 + Math.random() * 6000);
  }

  private botRaid() {
    const bot = BOTS[Math.floor(Math.random() * BOTS.length)];
    const from = BOT_CARTEL[bot];
    const targets = CARTEL_ORDER.filter((c) => c !== from);
    const target = targets[Math.floor(Math.random() * targets.length)];
    const tier = TIERS[Math.floor(Math.random() * TIERS.length)];
    const t = this.state.cartels[target];
    const q = quote(t.vault, tier, t.protection);
    const win = Math.random() < q.pEff;
    this.commit((n) => {
      const tt = n.cartels[target];
      tt.heat = Math.min(100, tt.heat + 4);
      if (win) {
        tt.vault -= q.vaultLossOnWin;
        n.cartels[from].vault += q.tribute;
        n.dumpsThisCount[from] += 1;
        this.push(n, { head: `${CARTELS[from].name} cartel dumps ${short(target)} vault for ${tier.label}`, sub: `${bot} swapped ${money(q.payout)} of ${CARTELS[target].ticker} into ${CARTELS[from].ticker}`, bad: target === n.player.cartel });
      } else {
        tt.vault += q.cost * (1 - ECON.FEE);
        this.push(n, { head: `${CARTELS[from].name} hitter busted at ${short(target)} door`, sub: `${bot}’s ${money(q.cost)} bought ${CARTELS[target].ticker}`, bad: false });
      }
    });
  }
}


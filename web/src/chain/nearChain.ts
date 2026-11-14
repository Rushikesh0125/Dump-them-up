// The real chain: reads the game contract over RPC and sends calls through wallet-selector.
// Signing in creates a function-call access key for the game contract, so jobs, protection and
// joining are signed in the background with no wallet popup.
import { setupWalletSelector, type WalletSelector } from '@near-wallet-selector/core';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { setupModal, type WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import '@near-wallet-selector/modal-ui/styles.css';
import { providers, type Account } from 'near-api-js';
import { ensureFunded, guestAccount, guestKeyPair, hasGuestKey, privyAccount } from './accounts';
import { rpcCall } from './rpc';
import { CARTELS, CARTEL_ORDER, PROTECTION, TIERS, type CartelId, type ProtectionTier } from '../game/config';
import { money } from '../game/economy';
import type { CartelState, ChainSnapshot, GameChain, NewsItem, RaidOutcome, RaidTicket } from './types';

const D = 1e6; // token decimals
const GAS = '100000000000000'; // 100 Tgas (wallet logins)
// Guest/email accounts hold little NEAR, and testnet reserves prepaid gas at a pessimistic price
// (100 Tgas = about 0.1 NEAR). Game calls burn ~3 Tgas, so 30 Tgas is plenty and needs only ~0.03 NEAR.
const LOCAL_GAS = 30_000_000_000_000n;
const num = (s: string | number) => Number(s) / D;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RawCartel {
  index: number; name: string; value_musd: string; count_start_value: string; shield_tier: number;
  shield_fund: string; protection_prices: string[]; raid_volume: string; dumps: number; members: number; locked: boolean;
  vault_tokens: string; price_musd_per_token_ppm: string; total_shares?: string; // total_shares: newer contracts only
}
interface RawGame { cartels: RawCartel[]; count_ends_ms: number; now_ms: number; next_raid: number }
interface RawPlayer {
  cartel: number; balances: string[]; shares: string; pending_loot: string; pending_loot_musd: string; raids: number; wins: number;
  big_wins: number; streak: number; respect: number; level: number; open_raid: number | null;
}
interface RawEvent { id: number; kind: string; actor: string; from: number; target: number; tier: number; amount: string; win: boolean; ts_ms: number }
interface RawRaid { id: number; target: number; tier: number; cost: string; p_eff_ppm: string; resolved: boolean; win: boolean; vault_loss: string }

/** Our own sub-accounts (the house crew) read as their first name. Set from the game id. */
let houseSuffix = '';
/** Implicit (64-hex) accounts from guest/email logins read as anon-a3f9c2; house crew as "ember". */
const who = (id: string) =>
  /^[0-9a-f]{64}$/.test(id)
    ? `anon-${id.slice(0, 6)}`
    : houseSuffix && id.endsWith(houseSuffix)
      ? id.slice(0, -houseSuffix.length).replace(/^bot-/, '') // retired bot-* accounts are the same crew
      : id;

/** Which contract method emits each event kind (to match events to transactions). */
const KIND_METHOD: Record<string, string[]> = {
  commit: ['commit_raid'], dump: ['resolve_raid'], busted: ['resolve_raid'], join: ['join_cartel'],
  shield_fund: ['pay_protection'], shield_on: ['pay_protection', 'settle_count'], count: ['settle_count'], bounty: ['settle_count'],
};
const NEARBLOCKS_API = 'https://api-testnet.nearblocks.io/v1';
export const NEARBLOCKS_TX = 'https://testnet.nearblocks.io/txns/';

/** Network trouble (rate limits, timeouts, nonce races) rather than the contract saying no. */
const isTransient = (msg: string) =>
  /fetch|429|too many|exceeded|timeout|timed out|nonce|network|unavailable|rpc|503|502|500/i.test(msg);

const savedLogin = () => { try { return localStorage.getItem('dtu.login'); } catch { return null; } };

/** The player's memecoins: their cartel coin (wallet + staked + tonight's loot) and any others. */
function holdingsOf(p: RawPlayer | null, cartels: RawCartel[]): import('./types').Holdings {
  const i = p?.cartel ?? 0;
  const c = cartels[i];
  const staked =
    !p ? 0
    : c?.total_shares === undefined ? null // older contract: can't convert shares to coins
    : BigInt(c.total_shares) === 0n ? 0
    : Number((BigInt(p.shares) * BigInt(c.vault_tokens)) / BigInt(c.total_shares)) / D;
  return {
    coin: CARTEL_ORDER[i],
    wallet: p ? num(p.balances[i]) : 0,
    staked,
    pending: p ? num(p.pending_loot ?? '0') : 0,
    price: c ? Number(c.price_musd_per_token_ppm) / 1e6 : 0,
    others: p ? CARTEL_ORDER.map((coin, k) => ({ coin, amount: num(p.balances[k]) })).filter((o, k) => k !== i && o.amount > 0) : [],
  };
}

const emptyCartel = (id: CartelId): CartelState => ({ id, vault: 0, maxVault: 1, countStartVault: 0, heat: 0, protection: 0, members: 0 });

function contractError(e: unknown): Error {
  const text = typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);
  const m = text.match(/panicked: ([^"\\]+)/) || text.match(/Smart contract panicked:? ?([^"\\]+)/);
  if (m) return new Error(m[1].trim());
  // a contract built without `--cfg near` loses its panic messages and traps with `unreachable`
  if (/unreachable|WasmTrap/i.test(text)) return new Error('The job was refused (not enough cash, or the vault is locked).');
  return new Error(text.slice(0, 160));
}

export class NearChain implements GameChain {
  private state: ChainSnapshot;
  private listeners = new Set<() => void>();
  private selector?: WalletSelector;
  private modal?: WalletSelectorModal;
  private accountId: string | null = null;
  private openRaid: number | null = null;
  private tickets = new Map<number, RaidTicket>();
  /** Event id -> transaction hash, filled from NearBlocks (contracts can't read their own tx hash). */
  private txByEvent = new Map<number, string>();
  private lastTxLookup = 0;
  private lastEvents: RawEvent[] = [];
  private lastCartel: number | undefined;
  /** Set for guest and email logins: the browser signs calls itself. */
  private local: Account | null = null;
  private login: 'wallet' | 'guest' | 'email' | undefined;
  private notice: string | undefined;
  private privy?: { login: () => void; logout: () => Promise<void> };
  private privyWaiter?: { resolve: () => void; reject: (e: Error) => void };

  readonly emailLogin: boolean;

  constructor(private game: string, private rpcs: string[], private network: 'testnet' | 'mainnet', private fundUrl: string, privyEnabled: boolean) {
    this.emailLogin = privyEnabled;
    houseSuffix = game.startsWith('game.') ? game.slice(4) : '';
    this.state = {
      session: { status: 'loading', accountId: null, network },
      cartels: { dragon: emptyCartel('dragon'), shitzu: emptyCartel('shitzu'), neko: emptyCartel('neko') },
      player: {
        account: '', cartel: 'dragon', cash: 0, take: 0, respect: 0, level: 0, streak: 0, raids: 0, wins: 0,
        bigWins: 0, protectionPaid: 0, protectionPrice: 1,
        holdings: { coin: 'dragon', wallet: 0, staked: 0, pending: 0, price: 0, others: [] },
      },
      news: [],
      countEndsAt: Date.now(),
      dumpsThisCount: { dragon: 0, shitzu: 0, neko: 0 },
    };
    this.init();
  }

  getSnapshot = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit(next: ChainSnapshot) {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  private async init() {
    this.selector = await setupWalletSelector({ network: this.network, modules: [setupMyNearWallet(), setupMeteorWallet()] });
    this.modal = setupModal(this.selector, { contractId: this.game });
    this.selector.store.observable.subscribe((s) => {
      if (this.local) return; // a guest or email login is active
      const id = s.accounts.find((a) => a.active)?.accountId ?? null;
      if (id !== this.accountId) {
        this.accountId = id;
        this.login = id ? 'wallet' : undefined;
        this.refresh();
      }
    });
    this.accountId = this.selector.store.getState().accounts.find((a) => a.active)?.accountId ?? null;
    if (this.accountId) this.login = 'wallet';
    else if (savedLogin() === 'guest' && hasGuestKey()) await this.playAsGuest().catch(() => undefined);
    await this.refresh();
    // Poll every 4 s; back off (up to 30 s) while the public RPC is rate-limiting us. Hidden tabs
    // don't poll at all: public RPCs limit per IP, so idle tabs would eat the active tab's budget.
    const loop = async () => {
      if (!document.hidden) {
        const ok = await this.refresh();
        this.failures = ok ? 0 : this.failures + 1;
      }
      setTimeout(loop, Math.min(30_000, 4_000 * 2 ** this.failures));
    };
    setTimeout(loop, 4_000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refresh();
    });
  }
  private failures = 0;

  // ---------------------------------------------------------------- reads

  private async view<T>(method: string, args: object = {}): Promise<T> {
    const j = await rpcCall(this.rpcs, 'query', {
      request_type: 'call_function', finality: 'optimistic', account_id: this.game, method_name: method, args_base64: btoa(JSON.stringify(args)),
    });
    if (j.error || j.result?.error) throw contractError(j.error?.data ?? j.result?.error ?? 'RPC error');
    return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result))) as T;
  }

  private async refresh(): Promise<boolean> {
    try {
      const [game, player, events] = await Promise.all([
        this.view<RawGame>('get_game'),
        this.accountId ? this.view<RawPlayer | null>('get_player', { account_id: this.accountId }) : Promise.resolve(null),
        this.view<RawEvent[]>('get_events', { limit: 14 }),
      ]);
      this.openRaid = player?.open_raid ?? null;
      const cartels = {} as Record<CartelId, CartelState>;
      const dumps = {} as Record<CartelId, number>;
      game.cartels.forEach((c, i) => {
        const id = CARTEL_ORDER[i];
        const value = num(c.value_musd);
        const start = num(c.count_start_value);
        cartels[id] = {
          id,
          vault: value,
          maxVault: Math.max(start, value, 1e-9),
          countStartVault: start,
          heat: value > 0 ? Math.min(100, Math.round((num(c.raid_volume) / value) * 1000)) : 0,
          protection: c.shield_tier as ProtectionTier,
          members: c.members,
        };
        dumps[id] = c.dumps;
      });
      const mine = player ? CARTEL_ORDER[player.cartel] : 'dragon';
      const own = player ? game.cartels[player.cartel] : undefined;
      const status = !this.accountId ? 'disconnected' : player ? 'ready' : 'no-cartel';
      this.emit({
        session: { status, accountId: this.accountId, network: this.network, login: this.login, notice: this.notice },
        cartels,
        player: {
          account: this.accountId ? who(this.accountId) : '',
          cartel: mine,
          cash: player ? num(player.balances[3]) : 0,
          take: player ? num(player.pending_loot_musd) : 0,
          respect: player?.respect ?? 0,
          level: player?.level ?? 0,
          streak: player?.streak ?? 0,
          raids: player?.raids ?? 0,
          wins: player?.wins ?? 0,
          bigWins: player?.big_wins ?? 0,
          protectionPaid: own ? num(own.shield_fund) : 0,
          protectionPrice: own ? Math.max(num(own.protection_prices[2]), 1e-6) : 1,
          holdings: holdingsOf(player, game.cartels),
        },
        news: this.buildNews(events, player?.cartel),
        countEndsAt: game.count_ends_ms,
        dumpsThisCount: dumps,
      });
      return true;
    } catch (e) {
      console.warn('refresh failed', e);
      if (this.state.session.status === 'loading') {
        this.emit({ ...this.state, session: { ...this.state.session, error: `Can't reach the city right now. Retrying…` } });
      }
      return false;
    }
  }

  private buildNews(events: RawEvent[], myCartel?: number): NewsItem[] {
    this.lastEvents = events;
    this.lastCartel = myCartel;
    const news = events
      .map((e) => {
        const n = this.headline(e, myCartel);
        return n && { ...n, tx: this.txByEvent.get(e.id) };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .slice(0, 8);
    if (news.some((n) => !n.tx) && Date.now() - this.lastTxLookup > 15_000) this.lookupTxs();
    return news;
  }

  /** Matches recent events to their transactions: an event's ts_ms is the block time of the receipt that emitted it. */
  private async lookupTxs() {
    this.lastTxLookup = Date.now();
    try {
      const r = await fetch(`${NEARBLOCKS_API}/account/${this.game}/receipts?per_page=25`);
      if (!r.ok) return;
      const { txns } = (await r.json()) as { txns: { block_timestamp: string; transaction_hash: string; actions?: { method?: string }[] }[] };
      const byMs = new Map<number, { hash: string; method?: string }[]>();
      for (const t of txns ?? []) {
        const ms = Number(BigInt(t.block_timestamp) / 1_000_000n);
        byMs.set(ms, [...(byMs.get(ms) ?? []), { hash: t.transaction_hash, method: t.actions?.[0]?.method }]);
      }
      let found = false;
      for (const e of this.lastEvents) {
        if (this.txByEvent.has(e.id)) continue;
        const cands = byMs.get(e.ts_ms);
        if (!cands) continue;
        const hit = cands.find((c) => c.method && KIND_METHOD[e.kind]?.includes(c.method)) ?? cands[0];
        this.txByEvent.set(e.id, hit.hash);
        found = true;
      }
      if (found) this.emit({ ...this.state, news: this.buildNews(this.lastEvents, this.lastCartel) });
    } catch {
      /* explorer unreachable: headlines just stay without links */
    }
  }

  private headline(e: RawEvent, myCartel?: number): NewsItem | null {
    const name = (i: number) => CARTELS[CARTEL_ORDER[i]].name;
    const ticker = (i: number) => CARTELS[CARTEL_ORDER[i]].ticker;
    const tier = TIERS[e.tier];
    const amt = num(e.amount);
    switch (e.kind) {
      case 'dump':
        return { id: e.id, head: `${name(e.from)} cartel dumps ${name(e.target)} vault for ${tier.label}`, sub: `${who(e.actor)} swapped ${money(amt * tier.m)} of ${ticker(e.target)} into ${ticker(e.from)}`, bad: e.target === myCartel };
      case 'busted':
        return { id: e.id, head: `${name(e.from)} hitter busted at ${name(e.target)} door`, sub: `${who(e.actor)}’s ${money(amt)} bought ${ticker(e.target)}`, bad: e.from === myCartel };
      case 'shield_on':
        return { id: e.id, head: `${name(e.from)} switches on ${PROTECTION[e.tier].name.split(' · ')[0].toLowerCase()}`, sub: `hitters’ odds cut to ${PROTECTION[e.tier].mult}× until the count`, bad: false };
      case 'shield_fund':
        return { id: e.id, head: `${who(e.actor)} chips into ${name(e.from)} protection`, sub: `${money(amt)} toward tier ${e.tier} cover`, bad: false };
      case 'bounty':
        return { id: e.id, head: `${name(e.from)} cartel takes the protection bounty`, sub: `${money(amt)} bought ${ticker(e.from)} for the vault`, bad: false };
      case 'count':
        return { id: e.id, head: 'The count is in', sub: 'stakes and loot settled, new prices set, protection expired', bad: false };
      case 'join':
        return { id: e.id, head: `${who(e.actor)} joins the ${name(e.from)} cartel`, sub: 'fresh muscle on the block', bad: false };
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------- writes

  private async call<T>(methodName: string, args: object, deposit = '0'): Promise<T> {
    if (this.local) {
      try {
        const outcome = await this.local.functionCall({ contractId: this.game, methodName, args, gas: LOCAL_GAS, attachedDeposit: BigInt(deposit) });
        return providers.getTransactionLastResult(outcome) as T;
      } catch (e) {
        throw contractError(e);
      }
    }
    if (!this.selector) throw new Error('Wallet is still loading');
    const wallet = await this.selector.wallet();
    try {
      const outcome = await wallet.signAndSendTransaction({
        receiverId: this.game,
        actions: [{ type: 'FunctionCall', params: { methodName, args, gas: GAS, deposit } }],
      });
      if (!outcome) throw new Error('Approve the transaction in your wallet');
      const status = (outcome as { status?: { SuccessValue?: string; Failure?: unknown } }).status;
      if (status?.Failure) throw contractError(JSON.stringify(status.Failure));
      const v = status?.SuccessValue;
      return (v ? JSON.parse(atob(v)) : null) as T;
    } catch (e) {
      throw contractError(e);
    }
  }

  connect() {
    this.modal?.show();
  }

  private setNotice(notice: string | undefined) {
    this.notice = notice;
    this.emit({ ...this.state, session: { ...this.state.session, notice } });
  }

  private async useLocal(account: Account, login: 'guest' | 'email') {
    try {
      this.setNotice('Setting up your testnet account…');
      await ensureFunded(this.rpcs, this.fundUrl, account.accountId);
      this.local = account;
      this.accountId = account.accountId;
      this.login = login;
      try { localStorage.setItem('dtu.login', login); } catch { /* ignore */ }
    } finally {
      this.setNotice(undefined);
    }
    await this.refresh();
  }

  async playAsGuest() {
    await this.useLocal(await guestAccount(this.rpcs, guestKeyPair()), 'guest');
  }

  // ----- Privy (email / Google). PrivyBridge, a React component inside PrivyProvider, feeds these.

  registerPrivy(api: { login: () => void; logout: () => Promise<void> }) {
    this.privy = api;
  }

  /** Opens Privy's sign-in. Resolves once the wallet is attached (or rejects on failure). */
  signInWithEmail() {
    if (!this.privy) return Promise.reject(new Error('Email sign-in is still loading. Try again in a second.'));
    const done = new Promise<void>((resolve, reject) => (this.privyWaiter = { resolve, reject }));
    this.privy.login();
    return done;
  }

  /** Privy signed the user in and has a NEAR wallet for them. */
  async attachPrivy(address: string, signRawHash: (hash: `0x${string}`) => Promise<`0x${string}`>) {
    if (this.login === 'wallet' || this.login === 'guest') return; // another login is active
    try {
      await this.useLocal(privyAccount(this.rpcs, address, signRawHash), 'email');
      this.privyWaiter?.resolve();
    } catch (e) {
      this.privyWaiter?.reject(e as Error);
      throw e;
    } finally {
      this.privyWaiter = undefined;
    }
  }

  /** The Privy modal was closed without signing in, or wallet creation failed. */
  privyFailed(e?: Error) {
    this.privyWaiter?.reject(e ?? new Error('Sign-in cancelled'));
    this.privyWaiter = undefined;
  }

  async disconnect() {
    if (this.local) {
      if (this.login === 'email') await this.privy?.logout().catch(() => undefined);
      this.local = null; // a guest key stays in this browser, so "Play as guest" brings the same account back
    } else if (this.selector) {
      await (await this.selector.wallet()).signOut();
    }
    try { localStorage.removeItem('dtu.login'); } catch { /* ignore */ }
    this.accountId = null;
    this.login = undefined;
    await this.refresh();
  }

  async joinCartel(cartel: CartelId) {
    await this.call('join_cartel', { cartel: CARTEL_ORDER.indexOf(cartel) });
    await this.refresh();
  }

  async commitRaid(target: CartelId, tierId: number): Promise<RaidTicket> {
    if (this.openRaid) {
      // a job left open (closed tab, lost connection): settle it first
      await this.call('resolve_raid', { raid_id: this.openRaid }).catch(() => undefined);
      this.openRaid = null;
    }
    const quote = await this.view<{ cost: string }>('get_quote', { target: CARTEL_ORDER.indexOf(target), tier: tierId }).catch(() => null);
    const cash = this.state.player.cash;
    if (quote && num(quote.cost) > cash) {
      throw new Error(`Not enough cash: this job costs $${num(quote.cost).toFixed(2)}, you have $${cash.toFixed(2)}.`);
    }
    const r = await this.call<RawRaid>('commit_raid', { target: CARTEL_ORDER.indexOf(target), tier: tierId });
    const tier = TIERS[tierId];
    const ticket: RaidTicket = { id: r.id, target, tierId, cost: num(r.cost), payout: num(r.cost) * tier.m, pEff: Number(r.p_eff_ppm) / 1e6 };
    this.tickets.set(r.id, ticket);
    this.refresh();
    return ticket;
  }

  async resolveRaid(ticketId: number): Promise<RaidOutcome> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error('Unknown job');
    const fromRaid = (raid: RawRaid): RaidOutcome => {
      this.refresh();
      return { ticket, win: raid.win, vaultLoss: raid.win ? num(raid.vault_loss) : 0 };
    };
    // Keep at it through rate limits and slow RPCs: the job is already locked in on-chain, so the
    // player must see its result. Each failure also checks whether the crank resolved it meanwhile.
    const deadline = Date.now() + 90_000;
    for (let attempt = 0; ; attempt++) {
      await sleep(attempt === 0 ? 1200 : Math.min(6000, 1000 * 1.4 ** attempt)); // outcome must come from a later block
      try {
        const out = await this.call<{ win: boolean; vault_loss: string }>('resolve_raid', { raid_id: ticketId });
        this.refresh();
        return { ticket, win: out.win, vaultLoss: num(out.vault_loss) };
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes('wait one block')) {
          const raid = await this.view<RawRaid | null>('get_raid', { raid_id: ticketId }).catch(() => null);
          if (raid?.resolved) return fromRaid(raid);
          if (!isTransient(msg) && !msg.includes('already resolved')) throw e; // a real contract error
        }
      }
      if (Date.now() > deadline) {
        throw new Error('The chain is very slow right now. Your job is locked in; its result will appear in The Daily Dump.');
      }
    }
  }

  async payProtection(amount: number) {
    await this.call('pay_protection', { tier: 2, amount: String(Math.round(amount * D)) });
    await this.refresh();
  }
}

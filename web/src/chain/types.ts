import type { CartelId, ProtectionTier } from '../game/config';

export interface CartelState {
  id: CartelId;
  vault: number;
  maxVault: number;
  countStartVault: number; // value at the start of this count; hits stop once it is down 10%
  heat: number; // 0..100, raid pressure
  protection: ProtectionTier;
  members: number;
}

export interface PlayerState {
  account: string;
  cartel: CartelId;
  cash: number; // internal balance available for jobs
  take: number; // winnings waiting for the count
  respect: number;
  level: number;
  streak: number;
  raids: number;
  wins: number;
  bigWins: number;
  protectionPaid: number;
  protectionPrice: number;
  /** Memecoin holdings: rewards are paid in the player's cartel coin. */
  holdings: Holdings;
}

export interface Holdings {
  /** The player's cartel coin. */
  coin: CartelId;
  /** Coins of that cartel held directly. */
  wallet: number;
  /** Coins staked in the cartel vault (from loot and stakes). null = the contract doesn't report it yet. */
  staked: number | null;
  /** Loot from tonight's wins, staked at the next count. */
  pending: number;
  /** mUSD per coin at the current snapshot. */
  price: number;
  /** Other cartels' coins held, if any. */
  others: { coin: CartelId; amount: number }[];
}

export interface NewsItem {
  id: number;
  head: string;
  sub: string;
  bad: boolean;
  /** Transaction hash on NEAR, when known (links to the explorer). */
  tx?: string;
}

export type SessionStatus = 'loading' | 'disconnected' | 'no-cartel' | 'ready';

export interface Session {
  status: SessionStatus;
  accountId: string | null;
  network: 'mock' | 'testnet' | 'mainnet';
  /** Set when the chain can't be reached. */
  error?: string;
  /** How the player signed in. */
  login?: 'wallet' | 'guest' | 'email';
  /** Progress text while a guest/email account is being set up. */
  notice?: string;
}

export interface ChainSnapshot {
  session: Session;
  cartels: Record<CartelId, CartelState>;
  player: PlayerState;
  news: NewsItem[];
  countEndsAt: number; // ms timestamp of the next count (epoch settlement)
  dumpsThisCount: Record<CartelId, number>;
}

export interface RaidTicket {
  id: number;
  target: CartelId;
  tierId: number;
  cost: number;
  payout: number;
  pEff: number;
}

export interface RaidOutcome {
  ticket: RaidTicket;
  win: boolean;
  vaultLoss: number;
}

/** What the UI needs from the chain. MockChain implements it today; the NEAR contract client replaces it. */
export interface GameChain {
  getSnapshot(): ChainSnapshot;
  subscribe(listener: () => void): () => void;
  /** Locks the job in: charges the cost. No backing out after this. */
  commitRaid(target: CartelId, tierId: number): Promise<RaidTicket>;
  /** Asks the contract for the outcome (on-chain randomness). The UI animates until this resolves. */
  resolveRaid(ticketId: number): Promise<RaidOutcome>;
  payProtection(amount: number): Promise<void>;
  /** Opens the wallet picker (no-op on the mock chain). */
  connect(): void;
  /** One-click play with a key kept in this browser (no wallet). */
  playAsGuest(): Promise<void>;
  /** Email / Google sign-in through Privy. Only offered when `emailLogin` is true. */
  signInWithEmail(): Promise<void>;
  readonly emailLogin: boolean;
  disconnect(): Promise<void>;
  joinCartel(cartel: CartelId): Promise<void>;
}

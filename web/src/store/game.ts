// UI flow state: which vault is targeted, which job is running, and the reveal moment.
// The chain decides every outcome; this store only sequences the screens around it.
import { create } from 'zustand';
import { chain } from '../chain/useChain';
import type { RaidOutcome, RaidTicket } from '../chain/types';
import { TIERS, type CartelId } from '../game/config';
import { sfx } from '../game/sfx';

export type Phase = 'idle' | 'tags' | 'job' | 'result';

interface Floater { key: number; target: CartelId; text: string; good: boolean }

interface GameUI {
  phase: Phase;
  target: CartelId | null;
  ticket: RaidTicket | null;
  outcome: RaidOutcome | null;
  resolving: boolean;
  /** Tier being committed on-chain (the job tag the player clicked), while the transaction is in flight. */
  committing: number | null;
  /** Set when the outcome couldn't be fetched; the job modal stays open and explains. */
  jobError: string | null;
  revealed: boolean;
  error: string | null;
  floater: Floater | null;
  shakeKey: number;
  selectTarget: (id: CartelId) => void;
  closeTags: () => void;
  startJob: (tierId: number) => Promise<void>;
  /** The player's action inside the mini-game: asks the chain for the outcome. */
  play: () => Promise<RaidOutcome | null>;
  /** Called by the mini-game once its landing animation finishes. */
  reveal: () => void;
  nextJob: () => void;
  backToStreet: () => void;
}

let revealTimer: ReturnType<typeof setTimeout> | undefined;

export const useGame = create<GameUI>((set, get) => ({
  phase: 'idle',
  target: null,
  ticket: null,
  outcome: null,
  resolving: false,
  committing: null,
  jobError: null,
  revealed: false,
  error: null,
  floater: null,
  shakeKey: 0,

  selectTarget: (id) => {
    const { phase, committing } = get();
    if (phase === 'job' || committing !== null) return;
    set({ phase: 'tags', target: id, ticket: null, outcome: null, revealed: false, error: null });
    sfx('open');
  },

  closeTags: () => { if (get().committing === null) set({ phase: 'idle', error: null }); },

  startJob: async (tierId) => {
    const { target, committing } = get();
    if (!target || committing !== null) return; // one job at a time: ignore double clicks
    set({ committing: tierId, error: null });
    sfx('commit');
    try {
      const ticket = await chain.commitRaid(target, tierId);
      set({ phase: 'job', ticket, outcome: null, resolving: false, revealed: false, error: null, committing: null });
    } catch (e) {
      set({ error: (e as Error).message, committing: null });
    }
  },

  play: async () => {
    const { ticket, resolving, outcome } = get();
    if (!ticket || resolving || outcome) return null;
    set({ resolving: true, jobError: null });
    // the coin's tings and the dial's ratchet come from the mini-games themselves
    const kick = ({ coin: 'toss', bag: 'pick', vault: 'clunk' } as const)[TIERS[ticket.tierId].type];
    sfx(kick);
    try {
      const result = await chain.resolveRaid(ticket.id);
      set({ outcome: result, resolving: false });
      return result;
    } catch (e) {
      // The job stays on-chain and the crank resolves it. Keep the modal open so the player sees why,
      // instead of it silently closing.
      set({ resolving: false, jobError: (e as Error).message });
      return null;
    }
  },

  reveal: () => {
    const { outcome } = get();
    if (!outcome) return;
    if (outcome.win) {
      sfx('kaching');
      sfx('win', { delay: 0.25 });
    } else sfx('trombone');
    set((s) => ({
      revealed: true,
      shakeKey: outcome.win ? s.shakeKey + 1 : s.shakeKey,
      floater: {
        key: Date.now(),
        target: outcome.ticket.target,
        text: outcome.win ? '-' + Math.round(outcome.vaultLoss).toLocaleString('en-US') : 'BUSTED',
        good: outcome.win,
      },
    }));
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => set({ phase: 'result' }), 1400);
  },

  nextJob: () => set(() => { sfx('click'); return { phase: 'tags', ticket: null, outcome: null, revealed: false, error: null, jobError: null }; }),
  backToStreet: () => set(() => { sfx('click'); return { phase: 'idle', ticket: null, outcome: null, revealed: false, error: null, jobError: null }; }),
}));

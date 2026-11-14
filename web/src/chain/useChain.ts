import { useSyncExternalStore } from 'react';
import { MockChain } from './mockChain';
import { NearChain } from './nearChain';
import type { GameChain } from './types';

import deployment from '../deployment.json';

// The testnet deployment written by `npm run setup` in bot/. Set VITE_USE_MOCK=1 to play on the local
// mock chain instead (UI work, offline demos). VITE_GAME_CONTRACT overrides the deployed contract.
const GAME = (import.meta.env.VITE_GAME_CONTRACT as string | undefined) || deployment.game;
const MOCK = import.meta.env.VITE_USE_MOCK === '1' || !GAME;
const RPC = (import.meta.env.VITE_NEAR_RPC as string | undefined) || deployment.rpc || 'https://rpc.testnet.fastnear.com';

const FUND_URL = (import.meta.env.VITE_FUND_URL as string | undefined) || deployment.fundUrl;
/** Privy app id for email / Google sign-in. Empty = the option is hidden. */
export const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID as string | undefined) || deployment.privyAppId || '';

// Backups for when the main public RPC rate-limits this browser.
const RPCS = [RPC, ...((deployment.rpcFallbacks as string[] | undefined) ?? [])];

export const nearChain = MOCK ? null : new NearChain(GAME, RPCS, 'testnet', FUND_URL, !!PRIVY_APP_ID);
export const chain: GameChain = nearChain ?? new MockChain();

export const useChain = () => useSyncExternalStore(chain.subscribe, chain.getSnapshot);

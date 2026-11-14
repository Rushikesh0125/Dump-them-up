// Shared NEAR helpers: env, key store, accounts, calls.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, keyStores, KeyPair, providers, utils, type Account, type Near } from 'near-api-js';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const NETWORK = 'testnet';
export const TGAS = 1_000_000_000_000n;
export const ONE_YOCTO = 1n;
export const DECIMALS = 6;
export const unit = (n: number) => BigInt(Math.round(n * 10 ** DECIMALS));

// --- .env (no dependency) ---
const envFile = join(here, '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const env = (k: string, fallback?: string) => {
  const v = process.env[k] || fallback;
  if (!v) throw new Error(`Set ${k} in bot/.env (see .env.example)`);
  return v;
};

export const MASTER = () => env('MASTER_ACCOUNT');
export const RPC = () => env('NEAR_RPC', 'https://rpc.testnet.fastnear.com');

/** Keys for accounts this tool creates live in bot/.keys (gitignored). The master key comes from
 *  MASTER_PRIVATE_KEY or ~/.near-credentials. */
export const localKeys = new keyStores.UnencryptedFileSystemKeyStore(join(here, '..', '.keys'));
const cliKeys = new keyStores.UnencryptedFileSystemKeyStore(join(homedir(), '.near-credentials'));

export async function nearConnection(): Promise<Near> {
  const store = new keyStores.MergeKeyStore([localKeys, cliKeys]);
  const pk = process.env.MASTER_PRIVATE_KEY;
  if (pk) await localKeys.setKey(NETWORK, MASTER(), KeyPair.fromString(pk as `ed25519:${string}`));
  return connect({ networkId: NETWORK, nodeUrl: RPC(), keyStore: store });
}

export async function accountExists(near: Near, id: string) {
  try {
    await (await near.account(id)).state();
    return true;
  } catch {
    return false;
  }
}

/** Creates `id` as a sub-account of the master with `near` NEAR, saving its new key locally. */
export async function ensureSubAccount(near: Near, id: string, nearAmount: string) {
  if (await accountExists(near, id)) return near.account(id);
  const master = await near.account(MASTER());
  const kp = KeyPair.fromRandom('ed25519');
  await localKeys.setKey(NETWORK, id, kp);
  await master.createAccount(id, kp.getPublicKey(), BigInt(utils.format.parseNearAmount(nearAmount)!));
  console.log(`  created ${id}`);
  return near.account(id);
}

export async function call(account: Account, contractId: string, methodName: string, args: object = {}, deposit = 0n, tgas = 100n) {
  const outcome = await account.functionCall({ contractId, methodName, args, gas: tgas * TGAS, attachedDeposit: deposit });
  return providers.getTransactionLastResult(outcome);
}

export async function view<T = unknown>(account: Account, contractId: string, methodName: string, args: object = {}): Promise<T> {
  return account.viewFunction({ contractId, methodName, args });
}

export const ids = () => {
  const m = MASTER();
  return {
    game: `game.${m}`,
    tokens: { dragon: `dragon.${m}`, shitzu: `shitzu.${m}`, neko: `neko.${m}`, musd: `musd.${m}` },
    bots: ['ember', 'pup', 'bonebag', 'whisker'].map((b) => `${b}.${m}`),
  };
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

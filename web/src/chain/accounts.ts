// Logins that need no wallet install: a guest key kept in this browser, or a Privy embedded wallet
// (email / Google). Both give the player an implicit (64-hex) NEAR account. The game's Worker funds it
// with a little testnet NEAR on first use (POST /fund), then the browser signs calls itself.
import { Account, Connection, InMemorySigner, KeyPair, keyStores, Signer, utils } from 'near-api-js';
import { rpcCall, stickyProvider } from './rpc';

const NETWORK = 'testnet';
const GUEST_KEY = 'dtu.guestKey';

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array((h.replace(/^0x/, '').match(/../g) ?? []).map((x) => parseInt(x, 16)));

/** Implicit account id = hex of the ed25519 public key. */
export const implicitId = (kp: KeyPair) => toHex(kp.getPublicKey().data);

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: guest lasts this tab only */ } },
};

/** The guest key for this browser, created on first use. */
export function guestKeyPair(): KeyPair {
  const saved = store.get(GUEST_KEY);
  if (saved) return KeyPair.fromString(saved as `ed25519:${string}`);
  const kp = KeyPair.fromRandom('ed25519');
  store.set(GUEST_KEY, kp.toString());
  return kp;
}
export const hasGuestKey = () => !!store.get(GUEST_KEY);

/** Signs with a Privy embedded NEAR wallet: near-api-js hands over the serialized tx, Privy signs its sha256. */
export class PrivySigner extends Signer {
  constructor(private address: string, private signRawHash: (hash: `0x${string}`) => Promise<`0x${string}`>) {
    super();
  }
  async createKey(): Promise<utils.PublicKey> {
    throw new Error('Privy wallets cannot create keys');
  }
  async getPublicKey(): Promise<utils.PublicKey> {
    return new utils.PublicKey({ keyType: utils.key_pair.KeyType.ED25519, data: fromHex(this.address) });
  }
  async signMessage(message: Uint8Array) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(message)));
    const sig = await this.signRawHash(`0x${toHex(hash)}`);
    return { signature: fromHex(sig), publicKey: await this.getPublicKey() };
  }
}

const connection = (rpcs: string[], signer: Signer) => new Connection(NETWORK, stickyProvider(rpcs), signer, 'jsvm.testnet');

export async function guestAccount(rpcs: string[], kp: KeyPair) {
  const ks = new keyStores.InMemoryKeyStore();
  const id = implicitId(kp);
  await ks.setKey(NETWORK, id, kp);
  return new Account(connection(rpcs, new InMemorySigner(ks)), id);
}

export function privyAccount(rpcs: string[], address: string, signRawHash: (hash: `0x${string}`) => Promise<`0x${string}`>) {
  return new Account(connection(rpcs, new PrivySigner(address.toLowerCase(), signRawHash)), address.toLowerCase());
}

async function exists(rpcs: string[], id: string) {
  const j = await rpcCall(rpcs, 'query', { request_type: 'view_account', finality: 'optimistic', account_id: id });
  return !!j.result;
}

/** Makes sure the implicit account exists on chain, asking the game's Worker to fund it if not. */
export async function ensureFunded(rpcs: string[], fundUrl: string, id: string) {
  if (await exists(rpcs, id)) return;
  const r = await fetch(fundUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: id }) });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(j.error || `Could not set up your account (${r.status})`);
  for (let i = 0; i < 10; i++) {
    if (await exists(rpcs, id)) return;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error('Your account is still being set up. Try again in a moment.');
}

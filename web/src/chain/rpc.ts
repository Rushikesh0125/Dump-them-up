// JSON-RPC with failover. Public testnet RPCs rate-limit per IP (FastNEAR answers 429 with no CORS
// header, which the browser reports as "Failed to fetch"), so on any failure we move to the next
// endpoint and stay there while it works.
import { providers } from 'near-api-js';

let current = 0;

export async function rpcCall<T = any>(rpcs: string[], method: string, params: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let lastError: unknown;
  for (let i = 0; i < rpcs.length; i++) {
    const idx = (current + i) % rpcs.length;
    try {
      const r = await fetch(rpcs[idx], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'dtu', method, params }),
      });
      if (r.status === 429 || r.status >= 500) throw new Error(`RPC ${rpcs[idx]} answered ${r.status}`);
      const j = (await r.json()) as T;
      current = idx;
      return j;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

const isNetworkError = (e: unknown) => {
  const t = String(e);
  return t.includes('Failed to fetch') || t.includes('FetchError') || t.includes('429') || t.includes('Too Many Requests') || t.includes('unavailable') || t.includes('Exceeded');
};

/**
 * near-api-js provider pinned to the endpoint that currently works (shared with rpcCall). It moves on
 * only for network errors and 429s; chain errors (InvalidNonce, contract panics) pass through
 * untouched so near-api-js can still re-sign with a fresh nonce. (near-api-js's own
 * FailoverRpcProvider wraps every error, which breaks that nonce retry.)
 */
class StickyProvider extends providers.JsonRpcProvider {
  constructor(private rpcs: string[]) {
    super({ url: rpcs[0] }, { retries: 2, backoff: 2, wait: 300 });
  }
  async sendJsonRpc<T>(method: string, params: object): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < this.rpcs.length; i++) {
      const idx = (current + i) % this.rpcs.length;
      (this as unknown as { connection: { url: string } }).connection = { url: this.rpcs[idx] }; // readonly in the types only
      try {
        const r = await super.sendJsonRpc<T>(method, params);
        current = idx;
        return r;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        lastError = e;
      }
    }
    throw lastError;
  }
}

export const stickyProvider = (rpcs: string[]) => new StickyProvider(rpcs);

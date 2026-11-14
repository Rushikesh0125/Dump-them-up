// POST /fund {account_id}: gives a brand-new implicit account (guest or Privy wallet) a little testnet
// NEAR so it exists on chain and can pay gas. Only 64-hex implicit ids that don't exist yet qualify.
import { Account, Connection, KeyPair, keyStores } from 'near-api-js';

export interface FundEnv {
  NEAR_RPC: string;
  SPONSOR_KEY: string;
  FUND_YOCTO: string;
  SPONSOR_FLOOR_YOCTO: string;
  ALLOWED_ORIGINS: string;
  FUND_LIMITER: RateLimit;
}

function cors(env: FundEnv, origin: string | null): Record<string, string> {
  const ok = origin && (env.ALLOWED_ORIGINS.split(',').includes(origin) || /^https:\/\/[a-z0-9-]+\.dump-them-up\.pages\.dev$/.test(origin));
  return ok
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {};
}

async function accountExists(rpc: string, id: string) {
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'f', method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: id } }),
  });
  const j = (await r.json()) as { result?: unknown; error?: { cause?: { name?: string } } };
  if (j.result) return true;
  if (j.error?.cause?.name === 'UNKNOWN_ACCOUNT') return false;
  throw new Error('RPC error checking account');
}

export async function handleFund(req: Request, env: FundEnv): Promise<Response> {
  const headers = cors(env, req.headers.get('Origin'));
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const body = (await req.json().catch(() => ({}))) as { account_id?: string };
  const id = String(body.account_id ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(id)) return reply(400, { error: 'Only new implicit (64-hex) accounts can be funded' });

  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await env.FUND_LIMITER.limit({ key: ip })).success) return reply(429, { error: 'Too many new players from here. Try again in a minute.' });

  try {
    if (await accountExists(env.NEAR_RPC, id)) return reply(200, { funded: false, exists: true });

    const { account_id, private_key } = JSON.parse(env.SPONSOR_KEY) as { account_id: string; private_key: string };
    const store = new keyStores.InMemoryKeyStore();
    await store.setKey('testnet', account_id, KeyPair.fromString(private_key as `ed25519:${string}`));
    const conn = Connection.fromConfig({
      networkId: 'testnet',
      provider: { type: 'JsonRpcProvider', args: { url: env.NEAR_RPC } },
      signer: { type: 'InMemorySigner', keyStore: store },
    });
    const sponsor = new Account(conn, account_id);
    const { amount } = await sponsor.state();
    if (BigInt(amount) < BigInt(env.SPONSOR_FLOOR_YOCTO)) return reply(503, { error: 'The game’s gas fund is empty. Connect a wallet instead.' });

    await sponsor.sendMoney(id, BigInt(env.FUND_YOCTO));
    console.log(`funded ${id.slice(0, 8)}… from ${ip}`);
    return reply(200, { funded: true });
  } catch (e) {
    console.error('fund failed:', String(e).slice(0, 200));
    return reply(502, { error: 'Could not fund the account right now. Try again.' });
  }
}

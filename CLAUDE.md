# Dump Them Up — handoff for Claude Code

NEAR Hackathon (Nov 2026) entry. Tracks: **Memecoins With Mechanics** + **Games With Real Economies**.
Memecoin cartels (Black Dragon, Shitzu, NEKO) hit each other's vaults. A won hit dumps the rival's
coin through its pool and buys the hitter's coin; a busted hit buys the target's coin for its stakers.
Protection ("covers") gets pricier with raid pressure. Hourly-style settlement is "the count"
(15 min on testnet). Full rules and math: `README.md`.

## Repo map
| Path | What |
|---|---|
| `contract/` | Game contract, Rust, near-sdk 5.30 (`src/lib.rs`, `src/math.rs`, `src/tests.rs`) |
| `token/` | NEP-141 token used for the 3 memecoins + mUSD |
| `bot/` | TS scripts (near-api-js 5.1): `setup` (deploy+seed), `crank` (settles count, bot cartels play), `status` |
| `crank-worker/` | Crank as a Cloudflare Worker (`dump-them-up-crank`, cron every minute, `wrangler.toml` pins the account) |
| `crank-worker/src/fund.ts` | `POST /fund`: funds new implicit accounts for guest/Privy players |
| `web/` | Vite + React 18 + TS + Framer Motion + Zustand UI, NEAR wallet-selector |
| `deployment.testnet.json` | Live testnet account ids (read by bot) |
| `web/src/deployment.json` | Game id + RPC (read by web) |
| `deploy-cloudflare.cmd` | Double-click deploy of web to Cloudflare Pages |

## Live state (testnet)
- Game: `game.dtu-59c7f8.testnet`; tokens `dragon.` `shitzu.` `neko.` `musd.` + `dtu-59c7f8.testnet`
- Master: `dtu-59c7f8.testnet` (~3–4 NEAR left). Bots: `ember`, `pup`, `bonebag`, `whisker` (renamed 2026-11-14; old `bot-*` accounts are retired, still members on-chain)
- RPC: `https://rpc.testnet.fastnear.com`. Count every 900 s.
- Account keys: `bot/.keys/testnet/*.json` — **gitignored, never commit, never print**.

## Commands
```bash
# contracts (Rust stable + wasm32 target, cargo-near 0.23)
cd contract && cargo test                      # 12 tests, RTP sims take a minute
cargo near build non-reproducible-wasm --no-abi  # in contract/ and token/  (or scripts/build-contracts.ps1)

# bot
cd bot && npm install
npm run status
npm run crank      # local crank; NOT while the Worker crank is live (same bot keys, nonces collide)
npm run worker-keys  # adds game-only keys to bots + uploads them as Worker secret BOT_KEYS (needs MASTER_ACCOUNT=dtu-59c7f8.testnet; no bot/.env exists)
npm run setup      # redeploy/seed (idempotent; costs testnet NEAR)

# web
cd web && npm install
npm run dev        # http://localhost:5173 (testnet mode because deployment.json has a game id)
VITE_USE_MOCK=1 npm run dev   # offline mock chain
npm run deploy     # build + wrangler pages deploy (project "dump-them-up", wrangler.toml); wrangler is logged in on this PC with 2 accounts: set `CLOUDFLARE_ACCOUNT_ID=7d7db815f4a8f55e80adbe86d041a846` (the user's own) first
```

## Locked decisions (don't change without asking)
- Economy: raider RTP 95%, defender edge −1%, tribute 5%, fee 1%, max loss per hit 1% of vault,
  10% drawdown lock per count, no self-raids, loot staked for the raider, staking changes apply at the count,
  randomness read in a later block than the commit (commit_raid → resolve_raid).
- Tiers: The Toss 1.9× (p .5), The Shell Game 3.8× (p .25), Crack the Safe 9.5× (p .1).
- Covers: Copium T1 / Hopium T2 / Diamond Hands T3, odds multipliers [1, .9, .8, .6].
- UI is locked ("Cartel war" screen): floating round vault doors, hang tags on click, animated mini-games,
  "The Daily Dump" newspaper full-height on the right, boss card + count/protection panels below the scene.
  Use "cartel", never "family".

## Status / next
- [x] UI, contracts, tests, testnet deploy, bot crank, wallet-selector wiring
- [x] Web deployed to Cloudflare Pages: https://dump-them-up.pages.dev (URL in README)
- [x] Guest login (browser key, Worker-funded implicit account) tested end to end on testnet 2026-11-14: join, commit, resolve all OK
- [x] Privy email/Google login live (App ID `cmwga0spp01ei0gjq2maas4fx` in `web/src/deployment.json`; origins pages.dev + localhost:5173 allowed in Privy dashboard). Tested 2026-11-14: wallet created, funded, join + hit signed via signRawHash
- [ ] A human wallet (MyNearWallet / Meteor testnet) plays end to end — never tested yet; fix anything found
- [x] Crank runs as Cloudflare Worker `dump-them-up-crank` (crank-worker/), deployed 2026-11-14. Bot turn ~1 per 4 min; bots have ~0.5 NEAR each (~10 days). Top up before judging.
- [ ] README economy simulation charts (week-long sim, 3 scenarios)
- [ ] Demo video, X post tagging @NEARProtocol #NEARHackathon, submission to both tracks (public repo)

## Gotchas
- Contract re-upgraded 2026-11-14 to code `7kstxiPe…` (same source, rebuilt with `--cfg near` so panic messages work). Before that (code `cNT27m4D…`): `CartelView` gained `total_shares` (view only, no state change). Previous code backed up as hash `DgZHip…`. Code-only redeploys: build with `RUSTFLAGS="--cfg near -C target-cpu=mvp -C link-arg=-s" cargo +1.95.0 build --target wasm32-unknown-unknown --release` (stable here is 1.94.1; cargo-near isn't installed), then `cd bot && MASTER_ACCOUNT=dtu-59c7f8.testnet npx tsx src/upgrade.ts <wasm>`. Only when stored structs are unchanged. `--cfg near` is required: without it near-sdk 5.30 compiles `require!`/`panic_str` to a bare `unreachable` trap, so every contract error (and the "wait one block" check `resolveRaid` relies on) reaches the client as `WasmTrap(Unreachable)`.
- `cargo test` currently fails to build on this PC (aws-lc-sys C compile error under MSVC), unrelated to game code.
- Rewards are cartel coins, not cash: the boss card's YOUR COINS panel = wallet + staked (shares * vault_tokens / total_shares) + pending_loot.
- Daily Dump tx links: `nearChain.lookupTxs` matches event `ts_ms` to NearBlocks `/account/<game>/receipts` `block_timestamp` (ns/1e6). No contract change needed.
- Python on this PC defaults to cp1252: always `PYTHONUTF8=1` / `encoding='utf-8'` when a script edits files, or non-ASCII (’ … ×) gets corrupted, and a failed write truncates the file.
- Sponsor `sponsor.dtu-59c7f8.testnet` funds guest/Privy players via Worker `POST /fund` (0.06 NEAR each). Key is the Worker secret SPONSOR_KEY (`cd bot && npm run sponsor`). Top up: `npm run sponsor -- --top-up 2`.
- Guest/email logins sign in the browser with near-api-js; prepaid gas 30 Tgas (LOCAL_GAS). Don't use near-api-js FailoverRpcProvider: it wraps InvalidNonce errors and breaks the nonce retry. `web/src/chain/rpc.ts` StickyProvider handles failover.
- Cloudflare: always the user's own account `7d7db815f4a8f55e80adbe86d041a846` (Jadhav Rushikesh), never the other account wrangler can see.
- wrangler 4.16x tries to delegate Pages to Workers and fails; the `dump-them-up` Pages project already exists, so plain `wrangler pages deploy` works. Don't pass `--force` again.
- near-sdk 5.30 needs Rust ≥ 1.95 (toolchain = stable). Non-test native builds fail by design; tests use the unit-testing feature.
- Web needs the `buffer` polyfill (`src/polyfills.ts`, imported first in main.tsx) or wallet-selector crashes.
- `nearChain.resolveRaid` retries until a later block; an open raid is auto-resolved before a new commit.
- Before making the repo public: confirm `bot/.keys/` and any `.env` are not tracked.

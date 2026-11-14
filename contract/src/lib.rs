//! Dump Them Up: a memecoin cartel war on NEAR.
//!
//! Three memecoin cartels each run a vault of their own coin. Players join a cartel, stake its coin,
//! and hit rival vaults through three jobs with fixed odds. A winning hit sells ("dumps") part of the
//! rival's vault through its pool and buys the hitter's coin with the proceeds. A failed hit buys the
//! rival's coin for its stakers. Vaults can buy protection, priced by recent raid pressure.
//!
//! Every economic parameter is a constant in this file or set once in `new`. There is no owner and no
//! setter: nobody can change the odds after deployment.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue};

mod math;
use math::{mul_div, swap_out};

// ---------------------------------------------------------------- immutable game parameters

/// Parts per million.
pub const PPM: u128 = 1_000_000;
/// Hitter's expected return per unit of cost on an unprotected vault (95%).
pub const RAIDER_RTP_PPM: u128 = 950_000;
/// Expected share of each job's cost paid to the hitter's cartel vault (5%).
pub const TRIBUTE_PPM: u128 = 50_000;
/// Protocol fee on every job (1%).
pub const FEE_PPM: u128 = 10_000;
/// A single winning hit takes at most this share of the target vault (1%).
pub const RAID_LOSS_CAP_PPM: u128 = 10_000;
/// A vault that lost this share of its value since the count started is closed to hits (10%).
pub const DRAWDOWN_CAP_PPM: u128 = 100_000;

/// The three jobs: (payout multiple, base win chance), both in PPM. Payout = RTP / p.
pub const TIERS: [(u128, u128); 3] = [
    (1_900_000, 500_000), // The Toss
    (3_800_000, 250_000), // The Shell Game
    (9_500_000, 100_000), // Crack the Safe
];

/// Protection tiers 0..3: multiplier on the hitter's win chance.
pub const SHIELD_MULT_PPM: [u128; 4] = [1_000_000, 900_000, 800_000, 600_000];
/// Base protection price per count, as a share of the vault's value.
pub const SHIELD_BASE_PPM: [u128; 4] = [0, 2_000, 5_000, 12_000];
/// Price sensitivity to raid pressure: price = base * value * (1 + K * pressure).
pub const SHIELD_K: u128 = 5;
/// Share of protection money sent at the count to the cartel with the most winning hits.
pub const SHIELD_BOUNTY_PPM: u128 = 800_000;

pub const MUSD: u8 = 3; // token index of the stablecoin
const MAX_EVENTS: usize = 64;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(10);

// ---------------------------------------------------------------- state

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Players,
    Raids,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Cartel {
    pub name: String,
    pub token: AccountId,
    /// Coins held by the vault on behalf of stakers.
    pub vault_tokens: U128,
    pub total_shares: U128,
    /// Internal constant-product pool: this cartel's coin against mUSD.
    pub pool_tokens: U128,
    pub pool_musd: U128,
    /// Pool reserves snapshotted at the start of the count: vault values and job prices use this price.
    pub snap_tokens: U128,
    pub snap_musd: U128,
    pub count_start_value: U128,
    pub shield_tier: u8,
    pub shield_fund: U128,
    pub raid_volume: U128,
    pub pressure_ppm: U128,
    pub dumps: u32,
    pub members: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Player {
    pub cartel: u8,
    /// Internal balances: three cartel coins then mUSD.
    pub balances: [U128; 4],
    pub shares: U128,
    pub pending_stake: U128,
    pub pending_unstake_shares: U128,
    /// Winnings in the player's cartel coin, staked for them at the next count.
    pub pending_loot: U128,
    pub pending_loot_musd: U128,
    pub raids: u32,
    pub wins: u32,
    pub big_wins: u32,
    pub streak: u32,
    pub respect: u32,
    pub level: u32,
    pub faucet_claimed: bool,
    pub open_raid: Option<u64>,
    pub queued: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Raid {
    pub id: u64,
    pub raider: AccountId,
    pub from: u8,
    pub target: u8,
    pub tier: u8,
    pub cost: U128,
    pub p_eff_ppm: U128,
    pub commit_height: u64,
    pub resolved: bool,
    pub win: bool,
    pub vault_loss: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Event {
    pub id: u64,
    pub kind: String,
    pub actor: AccountId,
    pub from: u8,
    pub target: u8,
    pub tier: u8,
    pub amount: U128,
    pub win: bool,
    pub ts_ms: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    cartels: Vec<Cartel>,
    musd_token: AccountId,
    count_seconds: u64,
    count_ends_ms: u64,
    faucet_musd: u128,
    faucet_tokens: u128,
    players: LookupMap<AccountId, Player>,
    raids: LookupMap<u64, Raid>,
    next_raid: u64,
    queue: Vec<AccountId>,
    events: Vec<Event>,
    next_event: u64,
    protocol_musd: u128,
    bounty_musd: u128,
}

// ---------------------------------------------------------------- views

#[near(serializers = [json])]
pub struct Quote {
    pub cost: U128,
    pub payout: U128,
    pub tribute: U128,
    pub vault_loss_on_win: U128,
    pub p_eff_ppm: U128,
    pub rtp_ppm: U128,
    pub locked: bool,
}

#[near(serializers = [json])]
pub struct CartelView {
    pub index: u8,
    pub name: String,
    pub token: AccountId,
    pub vault_tokens: U128,
    /// Staking shares outstanding: a player's coins in the vault = shares * vault_tokens / total_shares.
    pub total_shares: U128,
    pub value_musd: U128,
    pub count_start_value: U128,
    pub price_musd_per_token_ppm: U128,
    pub shield_tier: u8,
    pub shield_fund: U128,
    pub protection_prices: [U128; 4],
    pub raid_volume: U128,
    pub pressure_ppm: U128,
    pub dumps: u32,
    pub members: u32,
    pub locked: bool,
}

#[near(serializers = [json])]
pub struct GameView {
    pub cartels: Vec<CartelView>,
    pub count_ends_ms: u64,
    pub now_ms: u64,
    pub bounty_musd: U128,
    pub next_raid: u64,
}

#[near(serializers = [json])]
pub struct Outcome {
    pub raid_id: u64,
    pub win: bool,
    pub cost: U128,
    pub payout_musd: U128,
    pub loot_tokens: U128,
    pub vault_loss: U128,
}

// ---------------------------------------------------------------- contract

#[near]
impl Contract {
    /// One-time setup. `tokens` are the three cartel coins in order; `names` their display names.
    /// `faucet_*` > 0 enables a one-time testnet faucet per account (mUSD and the cartel's coin).
    #[init]
    #[private]
    pub fn new(
        names: Vec<String>,
        tokens: Vec<AccountId>,
        musd_token: AccountId,
        count_seconds: u64,
        faucet_musd: U128,
        faucet_tokens: U128,
    ) -> Self {
        require!(names.len() == 3 && tokens.len() == 3, "exactly three cartels");
        require!(count_seconds >= 60, "count too short");
        let cartels = names
            .into_iter()
            .zip(tokens)
            .map(|(name, token)| Cartel {
                name,
                token,
                vault_tokens: U128(0),
                total_shares: U128(0),
                pool_tokens: U128(0),
                pool_musd: U128(0),
                snap_tokens: U128(0),
                snap_musd: U128(0),
                count_start_value: U128(0),
                shield_tier: 0,
                shield_fund: U128(0),
                raid_volume: U128(0),
                pressure_ppm: U128(0),
                dumps: 0,
                members: 0,
            })
            .collect();
        Self {
            cartels,
            musd_token,
            count_seconds,
            count_ends_ms: env::block_timestamp_ms() + count_seconds * 1000,
            faucet_musd: faucet_musd.0,
            faucet_tokens: faucet_tokens.0,
            players: LookupMap::new(StorageKey::Players),
            raids: LookupMap::new(StorageKey::Raids),
            next_raid: 1,
            queue: Vec::new(),
            events: Vec::new(),
            next_event: 1,
            protocol_musd: 0,
            bounty_musd: 0,
        }
    }

    // ------------------------------------------------------------ joining and funds

    /// Join a cartel (0, 1 or 2). Switching is allowed only with nothing staked or pending.
    pub fn join_cartel(&mut self, cartel: u8) {
        require!((cartel as usize) < 3, "no such cartel");
        let id = env::predecessor_account_id();
        let mut p = self.players.get(&id).cloned().unwrap_or_default();
        let is_new = !self.players.contains_key(&id);
        if !is_new {
            require!(p.shares.0 == 0 && p.pending_stake.0 == 0 && p.pending_loot.0 == 0 && p.open_raid.is_none(), "unstake and settle before switching");
            self.cartels[p.cartel as usize].members = self.cartels[p.cartel as usize].members.saturating_sub(1);
        }
        p.cartel = cartel;
        self.cartels[cartel as usize].members += 1;
        if !p.faucet_claimed && self.faucet_musd > 0 {
            p.faucet_claimed = true;
            p.balances[MUSD as usize].0 += self.faucet_musd;
            p.balances[cartel as usize].0 += self.faucet_tokens;
        }
        self.players.insert(id.clone(), p);
        self.event("join", &id, cartel, cartel, 0, 0, false);
    }

    /// NEP-141 receiver. msg "" credits the sender's internal balance; "seed_pool" adds liquidity
    /// to that coin's pool (a donation: anyone may do it, nobody can take it out).
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let idx = self.token_index(&token).unwrap_or_else(|| env::panic_str("unknown token"));
        if msg.starts_with("seed_pool") {
            if idx == MUSD {
                let target: usize = msg.trim_start_matches("seed_pool:").parse().unwrap_or_else(|_| env::panic_str("use seed_pool:<cartel>"));
                require!(target < 3, "no such cartel");
                self.cartels[target].pool_musd.0 += amount.0;
                self.refresh_snapshot_if_empty(target);
            } else {
                self.cartels[idx as usize].pool_tokens.0 += amount.0;
                self.refresh_snapshot_if_empty(idx as usize);
            }
            return PromiseOrValue::Value(U128(0));
        }
        if msg == "seed_vault" {
            require!(idx < 3, "vaults hold cartel coins");
            self.cartels[idx as usize].vault_tokens.0 += amount.0;
            self.refresh_snapshot_if_empty(idx as usize);
            return PromiseOrValue::Value(U128(0));
        }
        let mut p = self.players.get(&sender_id).cloned().unwrap_or_else(|| env::panic_str("join a cartel first"));
        p.balances[idx as usize].0 += amount.0;
        self.players.insert(sender_id, p);
        PromiseOrValue::Value(U128(0))
    }

    /// Withdraw an internal balance (token index 0..3) back to the wallet.
    #[payable]
    pub fn withdraw(&mut self, token_index: u8, amount: U128) -> Promise {
        near_sdk::assert_one_yocto();
        require!(token_index <= MUSD, "no such token");
        let id = env::predecessor_account_id();
        let mut p = self.player(&id);
        require!(p.balances[token_index as usize].0 >= amount.0, "not enough balance");
        p.balances[token_index as usize].0 -= amount.0;
        self.players.insert(id.clone(), p);
        let token = self.token_account(token_index);
        Promise::new(token)
            .function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::json!({ "receiver_id": id, "amount": amount }).to_string().into_bytes(),
                NearToken::from_yoctonear(1),
                GAS_FT_TRANSFER,
            )
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_withdraw(id, token_index, amount))
    }

    #[private]
    pub fn on_withdraw(&mut self, account_id: AccountId, token_index: u8, amount: U128) {
        if !near_sdk::is_promise_success() {
            let mut p = self.player(&account_id);
            p.balances[token_index as usize].0 += amount.0;
            self.players.insert(account_id, p);
        }
    }

    // ------------------------------------------------------------ staking (applies at the count)

    pub fn stake(&mut self, amount: U128) {
        let id = env::predecessor_account_id();
        let mut p = self.player(&id);
        let c = p.cartel as usize;
        require!(amount.0 > 0 && p.balances[c].0 >= amount.0, "not enough coins");
        p.balances[c].0 -= amount.0;
        p.pending_stake.0 += amount.0;
        self.enqueue(&id, &mut p);
        self.players.insert(id.clone(), p);
        self.event("stake", &id, c as u8, c as u8, 0, amount.0, false);
    }

    pub fn unstake(&mut self, shares: U128) {
        let id = env::predecessor_account_id();
        let mut p = self.player(&id);
        require!(shares.0 > 0 && p.shares.0 >= shares.0 + p.pending_unstake_shares.0, "not enough shares");
        p.pending_unstake_shares.0 += shares.0;
        self.enqueue(&id, &mut p);
        self.players.insert(id, p);
    }

    // ------------------------------------------------------------ protection

    /// Chip mUSD into your cartel's protection fund. When the fund covers the price of `tier`,
    /// that tier switches on until the count. 80% of what is spent goes to the count's bounty.
    pub fn pay_protection(&mut self, tier: u8, amount: U128) {
        require!((1..=3).contains(&tier), "tier is 1, 2 or 3");
        let id = env::predecessor_account_id();
        let mut p = self.player(&id);
        require!(p.balances[MUSD as usize].0 >= amount.0 && amount.0 > 0, "not enough mUSD");
        p.balances[MUSD as usize].0 -= amount.0;
        let ci = p.cartel as usize;
        self.players.insert(id.clone(), p);
        self.cartels[ci].shield_fund.0 += amount.0;
        let price = self.protection_price(ci, tier);
        if tier > self.cartels[ci].shield_tier && self.cartels[ci].shield_fund.0 >= price {
            self.cartels[ci].shield_fund.0 -= price;
            self.cartels[ci].shield_tier = tier;
            let bounty = mul_div(price, SHIELD_BOUNTY_PPM, PPM);
            self.bounty_musd += bounty;
            self.protocol_musd += price - bounty;
            self.event("shield_on", &id, ci as u8, ci as u8, tier, price, true);
        } else {
            self.event("shield_fund", &id, ci as u8, ci as u8, tier, amount.0, false);
        }
    }

    // ------------------------------------------------------------ jobs

    /// Lock a job in: charges the cost now. The outcome is read in a later block by `resolve_raid`.
    pub fn commit_raid(&mut self, target: u8, tier: u8) -> Raid {
        require!((target as usize) < 3 && (tier as usize) < 3, "bad target or tier");
        let id = env::predecessor_account_id();
        let mut p = self.player(&id);
        require!(p.cartel != target, "a cartel cannot hit itself");
        require!(p.open_raid.is_none(), "finish your open job first");
        let q = self.quote_inner(target as usize, tier as usize);
        require!(!q.locked, "vault locked until the count");
        require!(q.cost.0 > 0, "vault is empty");
        require!(p.balances[MUSD as usize].0 >= q.cost.0, "not enough mUSD");
        p.balances[MUSD as usize].0 -= q.cost.0;
        let raid = Raid {
            id: self.next_raid,
            raider: id.clone(),
            from: p.cartel,
            target,
            tier,
            cost: q.cost,
            p_eff_ppm: q.p_eff_ppm,
            commit_height: env::block_height(),
            resolved: false,
            win: false,
            vault_loss: q.vault_loss_on_win,
        };
        self.next_raid += 1;
        p.open_raid = Some(raid.id);
        self.cartels[target as usize].raid_volume.0 += q.cost.0;
        self.players.insert(id.clone(), p);
        self.raids.insert(raid.id, raid.clone());
        self.event("commit", &id, raid.from, target, tier, q.cost.0, false);
        raid
    }

    /// Settle a committed job with block randomness from a later block than the commit.
    /// Anyone may call it (the raider's client does, and the crank picks up stragglers).
    pub fn resolve_raid(&mut self, raid_id: u64) -> Outcome {
        let mut raid = self.raids.get(&raid_id).cloned().unwrap_or_else(|| env::panic_str("no such job"));
        require!(!raid.resolved, "already resolved");
        require!(env::block_height() > raid.commit_height, "wait one block after the commit");
        let roll = Self::roll(raid_id, &raid.raider);
        let win = roll < raid.p_eff_ppm.0;
        let out = self.apply_outcome(&raid, win);
        raid.resolved = true;
        raid.win = win;
        self.raids.insert(raid_id, raid);
        out
    }

    // ------------------------------------------------------------ the count (epoch settlement)

    /// Anyone may call once the count is due: new price snapshot, protection expires, queued stakes,
    /// unstakes and loot are applied, and the bounty goes to the cartel with the most winning hits.
    pub fn settle_count(&mut self) {
        let now = env::block_timestamp_ms();
        require!(now >= self.count_ends_ms, "the count is not due yet");

        // bounty to the busiest winning cartel
        if self.bounty_musd > 0 {
            let top = (0..3).max_by_key(|&i| self.cartels[i].dumps).unwrap();
            if self.cartels[top].dumps > 0 {
                let musd = std::mem::take(&mut self.bounty_musd);
                let coins = self.buy(top, musd);
                self.cartels[top].vault_tokens.0 += coins;
                self.event("bounty", &env::current_account_id(), top as u8, top as u8, 0, musd, true);
            }
        }

        // queued stakes, unstakes and loot become shares / balances
        let queue = std::mem::take(&mut self.queue);
        for id in queue {
            let Some(mut p) = self.players.get(&id).cloned() else { continue };
            let c = p.cartel as usize;
            if p.pending_unstake_shares.0 > 0 {
                let s = p.pending_unstake_shares.0.min(p.shares.0);
                let coins = mul_div(s, self.cartels[c].vault_tokens.0, self.cartels[c].total_shares.0.max(1));
                self.cartels[c].vault_tokens.0 -= coins;
                self.cartels[c].total_shares.0 -= s;
                p.shares.0 -= s;
                p.balances[c].0 += coins;
                p.pending_unstake_shares = U128(0);
            }
            let incoming = p.pending_stake.0 + p.pending_loot.0;
            if incoming > 0 {
                let cart = &mut self.cartels[c];
                let minted = if cart.total_shares.0 == 0 || cart.vault_tokens.0 == 0 {
                    incoming
                } else {
                    mul_div(incoming, cart.total_shares.0, cart.vault_tokens.0)
                };
                cart.vault_tokens.0 += incoming;
                cart.total_shares.0 += minted;
                p.shares.0 += minted;
                p.pending_stake = U128(0);
                p.pending_loot = U128(0);
                p.pending_loot_musd = U128(0);
            }
            p.queued = false;
            self.players.insert(id, p);
        }

        // new snapshot, pressure, protection expiry
        for i in 0..3 {
            let value = self.vault_value(i);
            let c = &mut self.cartels[i];
            let observed = if value > 0 { mul_div(c.raid_volume.0, PPM, value) } else { 0 };
            c.pressure_ppm = U128((c.pressure_ppm.0 + observed) / 2);
            c.snap_tokens = c.pool_tokens;
            c.snap_musd = c.pool_musd;
            c.shield_tier = 0;
            c.raid_volume = U128(0);
            c.dumps = 0;
            let fresh = self.vault_value(i);
            self.cartels[i].count_start_value = U128(fresh);
        }
        while self.count_ends_ms <= now {
            self.count_ends_ms += self.count_seconds * 1000;
        }
        self.event("count", &env::predecessor_account_id(), 0, 0, 0, 0, true);
    }

    // ------------------------------------------------------------ views

    pub fn get_game(&self) -> GameView {
        GameView {
            cartels: (0..3).map(|i| self.cartel_view(i)).collect(),
            count_ends_ms: self.count_ends_ms,
            now_ms: env::block_timestamp_ms(),
            bounty_musd: U128(self.bounty_musd),
            next_raid: self.next_raid,
        }
    }

    pub fn get_player(&self, account_id: AccountId) -> Option<Player> {
        self.players.get(&account_id).cloned()
    }

    pub fn get_quote(&self, target: u8, tier: u8) -> Quote {
        require!((target as usize) < 3 && (tier as usize) < 3, "bad target or tier");
        self.quote_inner(target as usize, tier as usize)
    }

    pub fn get_raid(&self, raid_id: u64) -> Option<Raid> {
        self.raids.get(&raid_id).cloned()
    }

    /// Most recent events, newest first.
    pub fn get_events(&self, limit: Option<u32>) -> Vec<Event> {
        let n = limit.unwrap_or(20).min(MAX_EVENTS as u32) as usize;
        self.events.iter().rev().take(n).cloned().collect()
    }

    pub fn get_config(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({
            "raider_rtp_ppm": RAIDER_RTP_PPM, "tribute_ppm": TRIBUTE_PPM, "fee_ppm": FEE_PPM,
            "raid_loss_cap_ppm": RAID_LOSS_CAP_PPM, "drawdown_cap_ppm": DRAWDOWN_CAP_PPM,
            "tiers": TIERS.iter().map(|(m, p)| near_sdk::serde_json::json!({"payout_ppm": m.to_string(), "win_ppm": p.to_string()})).collect::<Vec<_>>(),
            "shield_mult_ppm": SHIELD_MULT_PPM.iter().map(|x| x.to_string()).collect::<Vec<_>>(),
            "shield_base_ppm": SHIELD_BASE_PPM.iter().map(|x| x.to_string()).collect::<Vec<_>>(),
            "shield_k": SHIELD_K, "shield_bounty_ppm": SHIELD_BOUNTY_PPM,
            "count_seconds": self.count_seconds, "musd_token": self.musd_token,
            "tokens": self.cartels.iter().map(|c| c.token.clone()).collect::<Vec<_>>(),
            "owner": near_sdk::serde_json::Value::Null,
        })
    }
}

// ---------------------------------------------------------------- internals

impl Contract {
    fn player(&self, id: &AccountId) -> Player {
        self.players.get(id).cloned().unwrap_or_else(|| env::panic_str("join a cartel first"))
    }

    fn token_index(&self, token: &AccountId) -> Option<u8> {
        if *token == self.musd_token {
            return Some(MUSD);
        }
        self.cartels.iter().position(|c| c.token == *token).map(|i| i as u8)
    }

    fn token_account(&self, idx: u8) -> AccountId {
        if idx == MUSD { self.musd_token.clone() } else { self.cartels[idx as usize].token.clone() }
    }

    fn enqueue(&mut self, id: &AccountId, p: &mut Player) {
        if !p.queued {
            p.queued = true;
            self.queue.push(id.clone());
        }
    }

    fn refresh_snapshot_if_empty(&mut self, i: usize) {
        let c = &mut self.cartels[i];
        if c.snap_tokens.0 == 0 || c.snap_musd.0 == 0 {
            c.snap_tokens = c.pool_tokens;
            c.snap_musd = c.pool_musd;
        }
        if self.cartels[i].snap_tokens.0 > 0 && self.cartels[i].snap_musd.0 > 0 {
            let v = self.vault_value(i);
            if self.cartels[i].count_start_value.0 < v {
                self.cartels[i].count_start_value = U128(v);
            }
        }
    }

    /// Vault value in mUSD at the count's snapshot price.
    fn vault_value(&self, i: usize) -> u128 {
        let c = &self.cartels[i];
        if c.snap_tokens.0 == 0 {
            return 0;
        }
        mul_div(c.vault_tokens.0, c.snap_musd.0, c.snap_tokens.0)
    }

    fn protection_price(&self, i: usize, tier: u8) -> u128 {
        let base = mul_div(self.vault_value(i), SHIELD_BASE_PPM[tier as usize], PPM);
        mul_div(base, PPM + SHIELD_K * self.cartels[i].pressure_ppm.0, PPM)
    }

    fn quote_inner(&self, target: usize, tier: usize) -> Quote {
        let (m, p) = TIERS[tier];
        let tau = mul_div(TRIBUTE_PPM, PPM, p);
        let loss_units = m - (PPM - FEE_PPM) + tau;
        let value = self.vault_value(target);
        let cost = mul_div(value, RAID_LOSS_CAP_PPM, loss_units);
        let p_eff = mul_div(p, SHIELD_MULT_PPM[self.cartels[target].shield_tier as usize], PPM);
        let floor = mul_div(self.cartels[target].count_start_value.0, PPM - DRAWDOWN_CAP_PPM, PPM);
        Quote {
            cost: U128(cost),
            payout: U128(mul_div(cost, m, PPM)),
            tribute: U128(mul_div(cost, tau, PPM)),
            vault_loss_on_win: U128(mul_div(cost, loss_units, PPM)),
            p_eff_ppm: U128(p_eff),
            rtp_ppm: U128(mul_div(p_eff, m, PPM)),
            locked: value < floor,
        }
    }

    fn cartel_view(&self, i: usize) -> CartelView {
        let c = &self.cartels[i];
        let value = self.vault_value(i);
        CartelView {
            index: i as u8,
            name: c.name.clone(),
            token: c.token.clone(),
            vault_tokens: c.vault_tokens,
            total_shares: c.total_shares,
            value_musd: U128(value),
            count_start_value: c.count_start_value,
            price_musd_per_token_ppm: U128(if c.snap_tokens.0 > 0 { mul_div(c.snap_musd.0, PPM, c.snap_tokens.0) } else { 0 }),
            shield_tier: c.shield_tier,
            shield_fund: c.shield_fund,
            protection_prices: [U128(0), U128(self.protection_price(i, 1)), U128(self.protection_price(i, 2)), U128(self.protection_price(i, 3))],
            raid_volume: c.raid_volume,
            pressure_ppm: c.pressure_ppm,
            dumps: c.dumps,
            members: c.members,
            locked: value < mul_div(c.count_start_value.0, PPM - DRAWDOWN_CAP_PPM, PPM),
        }
    }

    /// Uniform roll in [0, PPM) from the current block's random seed, mixed with the job id.
    fn roll(raid_id: u64, raider: &AccountId) -> u128 {
        let mut input = env::random_seed();
        input.extend_from_slice(&raid_id.to_le_bytes());
        input.extend_from_slice(raider.as_bytes());
        let h = env::sha256(&input);
        let mut b = [0u8; 8];
        b.copy_from_slice(&h[..8]);
        (u64::from_le_bytes(b) % PPM as u64) as u128
    }

    /// Sell `coins` of cartel `i` into its pool; returns mUSD received.
    fn sell(&mut self, i: usize, coins: u128) -> u128 {
        let c = &mut self.cartels[i];
        let out = swap_out(c.pool_tokens.0, c.pool_musd.0, coins);
        c.pool_tokens.0 += coins;
        c.pool_musd.0 -= out;
        out
    }

    /// Buy cartel `i` coins with `musd` from its pool; returns coins received.
    fn buy(&mut self, i: usize, musd: u128) -> u128 {
        let c = &mut self.cartels[i];
        let out = swap_out(c.pool_musd.0, c.pool_tokens.0, musd);
        c.pool_musd.0 += musd;
        c.pool_tokens.0 -= out;
        out
    }

    fn apply_outcome(&mut self, raid: &Raid, win: bool) -> Outcome {
        let (m, p) = TIERS[raid.tier as usize];
        let tau = mul_div(TRIBUTE_PPM, PPM, p);
        let cost = raid.cost.0;
        let stake_back = mul_div(cost, PPM - FEE_PPM, PPM);
        self.protocol_musd += cost - stake_back;
        let target = raid.target as usize;
        let from = raid.from as usize;
        let mut pl = self.player(&raid.raider);
        pl.raids += 1;
        pl.open_raid = None;

        let mut out = Outcome { raid_id: raid.id, win, cost: raid.cost, payout_musd: U128(0), loot_tokens: U128(0), vault_loss: U128(0) };
        let mut gain = 10;
        if win {
            // dump: sell the target's coins worth the vault loss, at the count price
            let loss_value = raid.vault_loss.0;
            let t = &self.cartels[target];
            let coins = mul_div(loss_value, t.snap_tokens.0, t.snap_musd.0.max(1)).min(t.vault_tokens.0);
            self.cartels[target].vault_tokens.0 -= coins;
            let proceeds = self.sell(target, coins) + stake_back;
            // pump: buy the hitter's coin; split between the hitter (m) and their cartel (tau)
            let bought = self.buy(from, proceeds);
            let to_raider = mul_div(bought, m, m + tau);
            self.cartels[from].vault_tokens.0 += bought - to_raider;
            self.cartels[from].dumps += 1;
            pl.pending_loot.0 += to_raider;
            pl.pending_loot_musd.0 += mul_div(cost, m, PPM);
            pl.wins += 1;
            pl.streak += 1;
            if raid.tier == 2 {
                pl.big_wins += 1;
            }
            gain = if raid.tier == 2 { 60 } else { 25 };
            out.payout_musd = U128(mul_div(cost, m, PPM));
            out.loot_tokens = U128(to_raider);
            out.vault_loss = U128(loss_value);
            let id = raid.raider.clone();
            self.enqueue(&id, &mut pl);
        } else {
            // busted: the stake buys the target's coin for its stakers
            let coins = self.buy(target, stake_back);
            self.cartels[target].vault_tokens.0 += coins;
            pl.streak = 0;
        }
        pl.respect += gain;
        while pl.respect >= 400 {
            pl.respect -= 400;
            pl.level += 1;
        }
        let raider = raid.raider.clone();
        self.players.insert(raider.clone(), pl);
        self.event(if win { "dump" } else { "busted" }, &raider, raid.from, raid.target, raid.tier, cost, win);
        out
    }

    #[allow(clippy::too_many_arguments)]
    fn event(&mut self, kind: &str, actor: &AccountId, from: u8, target: u8, tier: u8, amount: u128, win: bool) {
        let e = Event { id: self.next_event, kind: kind.to_string(), actor: actor.clone(), from, target, tier, amount: U128(amount), win, ts_ms: env::block_timestamp_ms() };
        self.next_event += 1;
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({ "standard": "dump-them-up", "version": "1.0.0", "event": kind, "data": [&e] })
        ));
        self.events.push(e);
        if self.events.len() > MAX_EVENTS {
            self.events.remove(0);
        }
    }
}

#[cfg(test)]
mod tests;

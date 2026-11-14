use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const ONE: u128 = 1_000_000; // 6-decimal tokens: 1 coin / 1 mUSD
const POOL: u128 = 1_000_000_000 * ONE; // deep pools keep slippage negligible in tests

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

struct World {
    c: Contract,
    height: u64,
    ts_ms: u64,
}

impl World {
    fn ctx(&self, who: &str) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc("game.testnet"))
            .predecessor_account_id(acc(who))
            .block_height(self.height)
            .block_timestamp(self.ts_ms * 1_000_000)
            .random_seed([7u8; 32]);
        b
    }
    fn as_(&mut self, who: &str) -> &mut Contract {
        testing_env!(self.ctx(who).build());
        &mut self.c
    }
    fn next_block(&mut self) {
        self.height += 1;
        self.ts_ms += 1_000;
    }
    fn deposit(&mut self, token: &str, from: &str, amount: u128, msg: &str) {
        testing_env!(self.ctx(token).build());
        let _ = self.c.ft_on_transfer(acc(from), U128(amount), msg.to_string());
    }
}

fn world() -> World {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("game.testnet")).predecessor_account_id(acc("game.testnet")).block_height(100).block_timestamp(1_000_000_000_000);
    testing_env!(b.build());
    let c = Contract::new(
        vec!["Black Dragon".into(), "Shitzu".into(), "NEKO".into()],
        vec![acc("dragon.testnet"), acc("shitzu.testnet"), acc("neko.testnet")],
        acc("musd.testnet"),
        3600,
        U128(1_000_000_000 * ONE),
        U128(10_000 * ONE),
    );
    let mut w = World { c, height: 100, ts_ms: 1_000_000 };
    for (i, t) in ["dragon.testnet", "shitzu.testnet", "neko.testnet"].iter().enumerate() {
        w.deposit(t, "seeder.testnet", POOL, "seed_pool");
        w.deposit("musd.testnet", "seeder.testnet", POOL, &format!("seed_pool:{i}"));
        w.deposit(t, "seeder.testnet", 50_000 * ONE, "seed_vault");
    }
    w
}

fn value_of_dragon(c: &Contract, coins: u128) -> u128 {
    let d = &c.cartels[0];
    mul_div(coins, d.pool_musd.0, d.pool_tokens.0)
}

#[test]
fn pricing_matches_the_spec() {
    let w = world();
    // vault worth 50,000 mUSD at price 1
    for (tier, (m, p)) in TIERS.iter().enumerate() {
        let q = w.c.quote_inner(1, tier);
        let tau = TRIBUTE_PPM * PPM / p;
        let loss_units = m - (PPM - FEE_PPM) + tau;
        let expected_cost = 50_000 * ONE * RAID_LOSS_CAP_PPM / loss_units;
        assert_eq!(q.cost.0, expected_cost);
        // a winning hit takes at most 1% of the vault
        assert!(q.vault_loss_on_win.0 <= 500 * ONE);
        // unprotected RTP is exactly 95%
        assert_eq!(q.rtp_ppm.0, 950_000);
    }
}

#[test]
#[should_panic(expected = "a cartel cannot hit itself")]
fn no_self_hits() {
    let mut w = world();
    w.as_("alice.testnet").join_cartel(0);
    w.as_("alice.testnet").commit_raid(0, 0);
}

#[test]
#[should_panic(expected = "wait one block after the commit")]
fn outcome_needs_a_later_block() {
    let mut w = world();
    w.as_("alice.testnet").join_cartel(0);
    let r = w.as_("alice.testnet").commit_raid(1, 0);
    w.as_("alice.testnet").resolve_raid(r.id);
}

#[test]
#[should_panic(expected = "finish your open job first")]
fn one_open_job_at_a_time() {
    let mut w = world();
    w.as_("alice.testnet").join_cartel(0);
    w.as_("alice.testnet").commit_raid(1, 0);
    w.as_("alice.testnet").commit_raid(2, 0);
}

#[test]
fn protection_cuts_the_odds() {
    let mut w = world();
    w.as_("nekofan.testnet").join_cartel(2);
    let price = w.c.protection_price(2, 3);
    w.as_("nekofan.testnet").pay_protection(3, U128(price));
    assert_eq!(w.c.cartels[2].shield_tier, 3);
    let q = w.c.quote_inner(2, 2);
    assert_eq!(q.p_eff_ppm.0, 60_000); // 10% * 0.6
    assert_eq!(q.rtp_ppm.0, 570_000); // 57%
    assert!(w.c.bounty_musd > 0);
}

#[test]
fn drawdown_cap_locks_the_vault() {
    let mut w = world();
    let start = w.c.cartels[1].vault_tokens.0;
    w.c.cartels[1].vault_tokens = U128(start * 89 / 100);
    assert!(w.c.quote_inner(1, 0).locked);
    w.ts_ms += 3_600_000;
    w.as_("anyone.testnet").settle_count();
    assert!(!w.c.quote_inner(1, 0).locked, "a new count resets the floor");
}

#[test]
#[should_panic(expected = "the count is not due yet")]
fn count_waits_for_its_time() {
    let mut w = world();
    w.as_("anyone.testnet").settle_count();
}

#[test]
fn stakes_and_loot_apply_at_the_count() {
    let mut w = world();
    w.as_("alice.testnet").join_cartel(0);
    w.as_("alice.testnet").stake(U128(1_000 * ONE));
    assert_eq!(w.c.get_player(acc("alice.testnet")).unwrap().shares.0, 0);
    w.ts_ms += 3_600_000;
    w.as_("anyone.testnet").settle_count();
    let p = w.c.get_player(acc("alice.testnet")).unwrap();
    assert!(p.shares.0 > 0);
    assert_eq!(p.pending_stake.0, 0);
}

#[test]
fn failed_hit_buys_the_target_coin() {
    let mut w = world();
    w.as_("alice.testnet").join_cartel(0);
    let before = w.c.cartels[1].vault_tokens.0;
    let r = w.as_("alice.testnet").commit_raid(1, 2);
    w.next_block();
    let raid = w.c.raids.get(&r.id).unwrap().clone();
    let out = w.as_("alice.testnet").apply_outcome(&raid, false);
    assert!(!out.win);
    assert!(w.c.cartels[1].vault_tokens.0 > before);
}

/// Over many jobs the hitter gets back ~95% of what they spend, at every tier.
fn measured_rtp(tier: u8, jobs: u32) -> f64 {
    let mut w = world();
    w.as_("hitter.testnet").join_cartel(0);
    let (mut spent, mut returned) = (0u128, 0u128);
    for i in 0..jobs {
        let target = 1 + (i % 2) as u8;
        if i % 50 == 0 || w.c.quote_inner(target as usize, tier as usize).locked {
            // a streak of wins trips the 10% drawdown lock (by design): settle a count and carry on
            w.ts_ms += 3_600_000;
            w.as_("crank.testnet").settle_count();
        }
        let r = w.as_("hitter.testnet").commit_raid(target, tier);
        w.next_block();
        let out = w.as_("hitter.testnet").resolve_raid(r.id);
        spent += out.cost.0;
        returned += value_of_dragon(&w.c, out.loot_tokens.0);
        // the mocked chain charges cached writes when they flush: flush every job, like a real block would
        testing_env!(w.ctx("hitter.testnet").build());
        w.c.players.flush();
        w.c.raids.flush();
    }
    let rtp = returned as f64 / spent as f64;
    println!("tier {tier}: {jobs} jobs, measured RTP {:.4}", rtp);
    rtp
}

#[test]
fn rtp_is_95_percent_toss() {
    let rtp = measured_rtp(0, 12_000);
    assert!((rtp - 0.95).abs() < 0.03, "The Toss RTP {rtp}");
}

#[test]
fn rtp_is_95_percent_shell_game() {
    let rtp = measured_rtp(1, 20_000);
    assert!((rtp - 0.95).abs() < 0.04, "Shell Game RTP {rtp}");
}

#[test]
fn rtp_is_95_percent_safe() {
    let rtp = measured_rtp(2, 40_000);
    assert!((rtp - 0.95).abs() < 0.05, "Crack the Safe RTP {rtp}");
}

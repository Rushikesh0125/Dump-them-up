// Raid pricing. Same formulas the contract enforces:
//   payout multiple m = RTP / p
//   tribute tau      = TRIBUTE / p          (multiple of cost, paid to the hitter's cartel on a win)
//   vault loss on win = (m - (1 - FEE) + tau) * cost
//   cost C            = RAID_LOSS_CAP * vault / (m - (1 - FEE) + tau)
// so a single winning hit never takes more than RAID_LOSS_CAP of the vault.
import { ECON, PROTECTION, type ProtectionTier, type Tier } from './config';

export interface Quote {
  cost: number;
  payout: number;
  tribute: number;
  vaultLossOnWin: number;
  pEff: number;
  rtp: number;
}

export function quote(vault: number, tier: Tier, protection: ProtectionTier): Quote {
  const tau = ECON.TRIBUTE / tier.p;
  const lossUnits = tier.m - (1 - ECON.FEE) + tau;
  const cost = (ECON.RAID_LOSS_CAP * vault) / lossUnits;
  const pEff = tier.p * PROTECTION[protection].mult;
  return {
    cost,
    payout: cost * tier.m,
    tribute: cost * tau,
    vaultLossOnWin: cost * lossUnits,
    pEff,
    rtp: pEff * tier.m,
  };
}

export const money = (n: number) =>
  '$' + (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(Math.abs(n) < 100 ? 2 : 0));

export const pct = (x: number) => Math.round(x * 100) + '%';

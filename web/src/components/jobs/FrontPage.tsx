import { CARTELS, TIERS, type CartelId } from '../../game/config';
import { money } from '../../game/economy';
import { useChain } from '../../chain/useChain';
import { useGame } from '../../store/game';
import { motion } from 'framer-motion';
import { Mascot } from '../scene/Mascot';

const SITE = 'https://dump-them-up.pages.dev';

/** X post with the result; the /b/<slug> link unfurls into the matching Daily Dump card (web/public/share). */
function shareUrl(me: CartelId, target: CartelId, win: boolean, text: string) {
  const link = `${SITE}/b/${me}-${win ? 'dumps' : 'busted'}-${target}/`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
}

function Token({ id, label, amount, good }: { id: CartelId; label: string; amount: string; good: boolean }) {
  const c = CARTELS[id];
  return (
    <div className="swap-token">
      <div className="swap-chip" style={{ borderColor: c.neon }}>
        <Mascot id={id} width={26} />
        <strong style={{ color: c.neon }}>{c.ticker}</strong>
      </div>
      <span className={`swap-amt ${good ? 'up' : 'down'}`}>{label} {amount}</span>
    </div>
  );
}

/** Spells out the trade: a win sells their coin and buys yours; a bust buys theirs with your stake. */
function SwapReceipt({ win, me, target, sold, bought, cost }: { win: boolean; me: CartelId; target: CartelId; sold: number; bought: number; cost: number }) {
  return (
    <div className="swap" aria-label={win ? `${CARTELS[target].ticker} sold, swapped into ${CARTELS[me].ticker}` : `Your stake bought ${CARTELS[target].ticker}`}>
      {win ? (
        <Token id={target} label="SOLD" amount={`−${money(sold)}`} good={false} />
      ) : (
        <div className="swap-token">
          <div className="swap-chip cash"><span className="vis-cash">$</span><strong>YOUR STAKE</strong></div>
          <span className="swap-amt down">−{money(cost)}</span>
        </div>
      )}
      <div className="swap-mid" aria-hidden="true">
        <span className="swap-tag" style={{ background: win ? '#2f7a46' : '#8a1c2b' }}>{win ? 'SWAPPED' : 'BOUGHT'}</span>
        <div className="swap-track">
          {[0, 1, 2].map((k) => (
            <motion.span
              key={k} className="vis-coin" style={{ background: win ? CARTELS[me].neon : CARTELS[target].neon }}
              animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.2, delay: k * 0.35, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
      {win ? (
        <Token id={me} label="BOUGHT" amount={`+${money(bought)}`} good />
      ) : (
        <Token id={target} label="for their stakers" amount="" good={false} />
      )}
    </div>
  );
}

/** The result, printed as an extra edition of The Daily Dump. */
export function FrontPage() {
  const { outcome, nextJob, backToStreet } = useGame();
  const me = useChain().player.cartel;
  if (!outcome) return null;
  const { ticket, win } = outcome;
  const tier = TIERS[ticket.tierId];
  const name = CARTELS[ticket.target].ticker.slice(1);
  const respect = win ? (tier.m > 9 ? 60 : 25) : 10;
  const them = CARTELS[ticket.target];
  const rtp = Math.round(ticket.pEff * tier.m * 100); // lower when the vault had protection
  const share = shareUrl(
    me,
    ticket.target,
    win,
    win
      ? `Just dumped the ${them.name} vault for ${money(ticket.payout)} (${tier.label}) on Dump Them Up. ${CARTELS[me].ticker} runs this block.`
      : `Got busted at the ${them.name} door on Dump Them Up. My ${money(ticket.cost)} just bought ${them.ticker}. Revenge is one job away.`,
  );

  return (
    <div className="front-wrap">
      <article className="front-page">
        <div className="front-mast"><span>THE DAILY DUMP</span><span>EXTRA EDITION</span></div>
        <h2 style={{ color: win ? 'var(--paper-ink)' : '#8a1c2b' }}>
          {win ? `${CARTELS[me].name.toUpperCase()} CARTEL DUMPS ${name}!` : `HITTER BUSTED AT ${name} DOOR`}
        </h2>
        <SwapReceipt win={win} me={me} target={ticket.target} sold={outcome.vaultLoss} bought={ticket.payout} cost={ticket.cost} />
        <p>
          {win
            ? `Their ${them.ticker} got sold out of their vault and swapped into ${CARTELS[me].ticker} for you (${tier.label}). It’s staked for you at the count.`
            : `Your stake bought ${them.ticker} for their cartel. Their coin pumps, yours waits for revenge.`}
        </p>
        <small>+{respect} respect · odds fixed on-chain</small>
        <small className="front-avg">
          {win
            ? `Paid ${tier.label} your stake. A bust would have paid $0: one hit is all-or-nothing, and this job averages ${rtp}% back over many hits.`
            : `A bust pays $0, a win pays ${tier.label}: one hit is all-or-nothing, and this job averages ${rtp}% back over many hits.`}
        </small>
      </article>
      <div className="front-actions">
        <a className="btn btn-paper" href={share} target="_blank" rel="noreferrer">{win ? 'Brag on X' : 'Post it on X'}</a>
        <button type="button" className="btn btn-red" onClick={nextJob}>Next job</button>
        <button type="button" className="btn btn-ghost" onClick={backToStreet}>Back to the street</button>
      </div>
    </div>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import { useChain } from '../../chain/useChain';
import { CARTELS, TIERS } from '../../game/config';
import { money, pct, quote } from '../../game/economy';
import { useGame } from '../../store/game';
import { CasingLoader } from './CasingLoader';

const STRINGS = [40, 76, 52];
const OFFSETS = [-270, -80, 110];

const rtpInk = (r: number) => (r >= 0.9 ? '#2f7a46' : r >= 0.75 ? '#8a6a1c' : '#8a1c2b');

/** Job tags that drop on strings from the rail and swing to a stop. */
export function HangTags() {
  const snap = useChain();
  const { target, startJob, closeTags, error, committing } = useGame();
  if (!target) return null;
  const t = snap.cartels[target];

  return (
    <motion.div className={`tags-layer${committing !== null ? ' is-committing' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="tags-dim" aria-label="Put the job tags away" onClick={closeTags} />
      <div className="tags-rail" />
      <div className="tags-title">Jobs on {CARTELS[target].ticker}</div>
      {TIERS.map((tier, i) => {
        const q = quote(t.vault, tier, t.protection);
        return (
          <motion.div
            key={tier.id}
            className="tag-hanger"
            style={{ left: `calc(50% + ${OFFSETS[i]}px)` }}
            initial={{ y: -(STRINGS[i] + 260), rotate: 0 }}
            animate={{ y: 0, rotate: [0, 14, -10, 6, -3, 1.5, 0] }}
            exit={{ y: -(STRINGS[i] + 260), transition: { duration: 0.35, ease: 'easeIn' } }}
            transition={{
              y: { type: 'spring', stiffness: 170, damping: 13, delay: i * 0.12 },
              rotate: { duration: 1.9, delay: i * 0.12 + 0.2, ease: 'easeOut' },
            }}
          >
            <div className="tag-string" style={{ height: STRINGS[i] }} />
            <button
              type="button"
              className={`hang-tag${committing === tier.id ? ' picked' : ''}`}
              style={{ top: STRINGS[i] }}
              onClick={() => startJob(tier.id)}
              disabled={committing !== null}
            >
              <span className="tag-hole" />
              <span className="tag-no">JOB No. 0{tier.id + 1}</span>
              <span className="tag-name">{tier.name}</span>
              <span className="tag-stamp" style={{ borderColor: tier.stamp, color: tier.stamp }}>{tier.label}</span>
              <span className="tag-line">{pct(q.pEff)} odds · costs {money(q.cost)}</span>
              {/* one hit is all-or-nothing; the RTP is the long-run average */}
              <span className="tag-line tag-outcomes">
                <b style={{ color: '#2f7a46' }}>win {money(q.payout)}</b> · <b style={{ color: '#8a1c2b' }}>bust $0</b>
              </span>
              <span className="tag-line tag-rtp" style={{ color: rtpInk(q.rtp) }}>{Math.round(q.rtp * 100)}% back on average</span>
            </button>
          </motion.div>
        );
      })}
      <AnimatePresence>
        {committing !== null && (
          <CasingLoader key="casing" me={snap.player.cartel} target={target} tierId={committing} cost={quote(t.vault, TIERS[committing], t.protection).cost} />
        )}
      </AnimatePresence>
      {error && <div className="tags-error" role="alert">{error}</div>}
    </motion.div>
  );
}

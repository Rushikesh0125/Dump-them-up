import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { sfx } from '../../game/sfx';
import { useChain } from '../../chain/useChain';
import { NEARBLOCKS_TX } from '../../chain/nearChain';
import { CARTELS, CARTEL_ORDER } from '../../game/config';
import { money } from '../../game/economy';

export function DailyDump() {
  const snap = useChain();
  // EXTRA EXTRA: a new headline on the press gets a paper rustle and the newsroom bell
  const seen = useRef<Set<number> | null>(null);
  const lastRing = useRef(0);
  useEffect(() => {
    const ids = snap.news.map((n) => n.id);
    if (!seen.current) { if (ids.length) seen.current = new Set(ids); return; }
    const fresh = ids.some((id) => !seen.current!.has(id));
    ids.forEach((id) => seen.current!.add(id));
    if (fresh && Date.now() - lastRing.current > 2500) { lastRing.current = Date.now(); sfx('extra'); }
  }, [snap.news]);
  const standings = [...CARTEL_ORDER].sort((a, b) => snap.cartels[b].vault - snap.cartels[a].vault);
  return (
    <aside className="paper" aria-label="The Daily Dump">
      <div className="paper-inner">
      <div className="masthead">
        <div className="display">The Daily Dump</div>
        <div className="mono small">Night edition · all the news that’s fit to dump</div>
      </div>
      <div className="headlines">
      <AnimatePresence initial={false} mode="popLayout">
        {snap.news.map((n) => (
          <motion.div
            key={n.id}
            className="headline"
            layout
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <div className="display" style={{ color: n.bad ? '#8a1c2b' : 'var(--paper-ink)' }}>{n.head}</div>
            <div className="mono small">{n.sub}</div>
            {n.tx && (
              <a className="tx-link mono" href={NEARBLOCKS_TX + n.tx} target="_blank" rel="noreferrer" aria-label={`View transaction for: ${n.head}`}>
                view tx ↗
              </a>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      </div>
      <div className="standings">
      <div className="mono small bold">CARTELS BY STASH</div>
      {standings.map((id, i) => (
        <div key={id} className="row-between mono">
          <span>{i + 1}. {CARTELS[id].ticker}</span>
          <strong>{money(snap.cartels[id].vault)}</strong>
        </div>
      ))}
      </div>
      </div>
    </aside>
  );
}

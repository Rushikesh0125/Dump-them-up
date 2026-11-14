import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useGame } from '../../store/game';
import { sfx } from '../../game/sfx';

/** 3.8×: four bags get shuffled, you pick one. The chain decides whether yours holds the take. */
export function ShellGame() {
  const { play, reveal, outcome } = useGame();
  const [order, setOrder] = useState([0, 1, 2, 3]);
  const [shuffling, setShuffling] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  const [lootBag, setLootBag] = useState<number | null>(null);

  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      setOrder((o) => {
        const next = o.slice();
        const a = Math.floor(Math.random() * 4);
        const b = (a + 1 + Math.floor(Math.random() * 3)) % 4;
        [next[a], next[b]] = [next[b], next[a]];
        return next;
      });
      sfx('swish');
      if (++n >= 10) { clearInterval(t); setShuffling(false); }
    }, 220);
    return () => clearInterval(t);
  }, []);

  // the chain answered: show which bag held the take
  useEffect(() => {
    if (!outcome || picked === null || lootBag !== null) return;
    const other = (picked + 1 + Math.floor(Math.random() * 3)) % 4;
    setLootBag(outcome.win ? picked : other);
    sfx('pop');
  }, [outcome, picked, lootBag]);

  // then hand over to the reveal moment
  useEffect(() => {
    if (lootBag === null) return;
    const t = setTimeout(reveal, 700);
    return () => clearTimeout(t);
  }, [lootBag, reveal]);

  const pick = (bag: number) => {
    if (shuffling || picked !== null) return;
    setPicked(bag);
    play();
  };

  const hint = shuffling
    ? 'Shuffling the bags…'
    : picked === null ? 'Pick one bag'
    : lootBag === null ? 'Opening it up…'
    : outcome?.win ? 'You found the take!' : 'Empty. The take was in another bag.';

  return (
    <div className="game">
      <span className="game-hint" style={{ color: lootBag === null ? 'var(--ink)' : outcome?.win ? 'var(--green)' : 'var(--red-soft)' }}>{hint}</span>
      <div className="bag-row">
        {order.map((bag) => {
          const isPick = picked === bag;
          const isLoot = lootBag === bag;
          const revealed = lootBag !== null;
          return (
            <motion.button
              layout
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              key={bag}
              type="button"
              className="bag"
              onClick={() => pick(bag)}
              disabled={shuffling || picked !== null}
              animate={{ y: isPick ? -22 : 0 }}
              style={{
                borderColor: isLoot ? 'var(--green)' : isPick ? 'var(--red)' : 'var(--line-2)',
                background: isLoot ? 'rgba(123,216,143,0.14)' : isPick ? 'rgba(224,52,74,0.14)' : 'var(--panel-2)',
              }}
              aria-label={`Bag ${bag + 1}`}
            >
              <svg width="54" height="54" viewBox="0 0 24 24" fill={isLoot ? '#d4a53a' : revealed ? '#4a3d2e' : '#c9a24a'} stroke="#0f0d0b" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 3h6l-2 4h-2zM7 8h10c3 3 4 7 2 10-1 2-3 3-7 3s-6-1-7-3c-2-3-1-7 2-10z" />
                <path d="M10 14h4" />
              </svg>
              <span className="bag-label" style={{ color: isLoot ? 'var(--green)' : isPick ? 'var(--red-soft)' : 'var(--ink-2)' }}>
                {revealed ? (isLoot ? 'THE TAKE' : isPick ? 'EMPTY' : '') : `BAG ${bag + 1}`}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

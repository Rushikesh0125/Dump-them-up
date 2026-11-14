import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CARTELS, TIERS, type CartelId } from '../../game/config';
import { money } from '../../game/economy';
import { Mascot } from '../scene/Mascot';

const STEPS = (ticker: string) => [
  `Casing the ${ticker} joint`,
  'Greasing the doorman',
  'Signing the job on-chain',
  'Waiting for a fresh block',
];
const STEP_AT_MS = [0, 700, 1500, 2500];

const QUIPS = [
  'Win and their coin gets sold, swapped into yours.',
  'Odds are fixed in the contract. Respect never changes them.',
  'A busted hit buys their coin for their stakers. Pick your mark.',
  'Protection cuts hitters’ odds until the count.',
  'Loot gets staked for your cartel at the count.',
  'Vaults lock after a 10% drawdown in one count.',
];

/**
 * Shown while commit_raid is in flight (2–5 s on testnet): the player's boss sneaks up on the
 * rival vault while the job's steps tick off. Purely cosmetic; the chain call drives the timing.
 */
export function CasingLoader({ me, target, tierId, cost }: { me: CartelId; target: CartelId; tierId: number; cost: number }) {
  const tier = TIERS[tierId];
  const steps = STEPS(CARTELS[target].ticker);
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [quip] = useState(() => QUIPS[Math.floor(Math.random() * QUIPS.length)]);

  useEffect(() => {
    const timers = STEP_AT_MS.map((ms, i) => setTimeout(() => setStep(i), ms));
    timers.push(setTimeout(() => setSlow(true), 9000));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="casing"
      role="status"
      aria-live="polite"
      aria-label={`${steps[step]}…`}
      initial={{ opacity: 0, scale: 0.9, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
    >
      <div className="casing-head">
        <span className="tag-no">JOB No. 0{tierId + 1} · {money(cost)} on the line</span>
        <span className="casing-title" style={{ color: tier.stamp }}>{tier.name}</span>
      </div>

      <div className="casing-street" aria-hidden="true">
        <motion.div
          className="casing-sneak"
          animate={{ x: ['0%', '210%'], y: [0, -4, 0, -4, 0, -4, 0] }}
          transition={{ x: { duration: 2.6, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }, y: { duration: 1.3, repeat: Infinity } }}
        >
          <Mascot id={me} width={34} />
        </motion.div>
        <div className="casing-door" style={{ borderColor: CARTELS[target].neon }}>
          <motion.svg viewBox="0 0 40 40" width="34" height="34" animate={{ rotate: [0, 120, 40, 200, 160, 320, 360] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
            <circle cx="20" cy="20" r="17" fill="none" stroke={CARTELS[target].neon} strokeWidth="3" />
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1="20" y1="5" x2="20" y2={i % 3 ? 8 : 10} stroke={CARTELS[target].neon} strokeWidth="2" transform={`rotate(${i * 30} 20 20)`} />
            ))}
            <circle cx="20" cy="20" r="5" fill={CARTELS[target].neon} />
          </motion.svg>
        </div>
      </div>

      <ol className="casing-steps">
        {steps.map((s, i) => (
          <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
            <span className="casing-tick" aria-hidden="true">{i < step ? '✓' : i === step ? '' : '·'}</span>
            {s}
            {i === step && <span className="casing-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>}
          </li>
        ))}
      </ol>

      <div className="bar casing-heat" aria-hidden="true">
        <motion.div initial={{ width: '4%' }} animate={{ width: '92%' }} transition={{ duration: 6, ease: [0.2, 0.7, 0.3, 1] }} style={{ background: tier.color }} />
      </div>
      <p className="casing-quip mono small muted">{slow ? 'Testnet is slow tonight. Still on it…' : quip}</p>
    </motion.div>
  );
}

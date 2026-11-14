import confetti from 'canvas-confetti';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useEffect } from 'react';
import { useChain } from '../../chain/useChain';
import { CARTELS, TIERS } from '../../game/config';
import { money, pct } from '../../game/economy';
import { useGame } from '../../store/game';
import { Mascot } from '../scene/Mascot';
import { BurstFx } from './BurstFx';
import { CrackTheSafe } from './CrackTheSafe';
import { FrontPage } from './FrontPage';
import { ShellGame } from './ShellGame';
import { TheToss } from './TheToss';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function JobModal() {
  const snap = useChain();
  const { phase, ticket, outcome, revealed, jobError, backToStreet } = useGame();
  const body = useAnimationControls();

  useEffect(() => {
    if (!revealed || !outcome) return;
    if (outcome.win) {
      if (!reducedMotion()) {
        confetti({ particleCount: 90, spread: 80, startVelocity: 38, origin: { x: 0.42, y: 0.42 }, colors: ['#d4a53a', '#f0cf7a', '#8a6a1c'], shapes: ['circle'], scalar: 1.1 });
      }
    } else {
      body.start({ x: [0, -9, 9, -6, 6, -3, 0], transition: { duration: 0.5 } });
    }
  }, [revealed, outcome, body]);

  if (!ticket) return null;
  const tier = TIERS[ticket.tierId];
  const me = snap.player.cartel;
  const them = ticket.target;

  return (
    <motion.div className="job-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="job-card" initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
        <div className="sweep" aria-hidden="true" />
        <header className="job-head">
          <div className="versus">
            <div className="portrait" style={{ borderColor: CARTELS[me].neon }}><Mascot id={me} width={38} /></div>
            <span className="you">YOU</span>
          </div>
          <div className="job-title">
            <span style={{ color: tier.color }}>{tier.name}</span>
            <small>{tier.label} payout · {pct(ticket.pEff)} odds</small>
          </div>
          <div className="versus">
            <span className="them">{CARTELS[them].ticker}</span>
            <div className="portrait" style={{ borderColor: CARTELS[them].neon }}><Mascot id={them} width={38} /></div>
          </div>
        </header>

        <motion.div className="job-body" animate={body}>
          {phase === 'job' && tier.type === 'coin' && <TheToss me={me} them={them} />}
          {phase === 'job' && tier.type === 'bag' && <ShellGame />}
          {phase === 'job' && tier.type === 'vault' && <CrackTheSafe />}
          {phase === 'result' && <FrontPage />}
          <AnimatePresence>
            {phase === 'job' && revealed && outcome && <BurstFx key="fx" win={outcome.win} />}
            {phase === 'job' && revealed && outcome && (
              <motion.div
                className="pop"
                style={{ color: outcome.win ? 'var(--green)' : 'var(--red)' }}
                initial={{ y: -30, scale: 1.5, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 14 }}
              >
                {outcome.win ? 'DUMPED!' : 'BUSTED'}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {phase === 'job' && jobError && (
          <div className="job-error" role="alert">
            <p>{jobError}</p>
            <button type="button" className="btn btn-ghost" onClick={backToStreet}>Back to the street</button>
          </div>
        )}
        {phase === 'job' && !jobError && (
          <p className="locked">
            The job is on: {money(ticket.cost)} committed · {pct(ticket.pEff)} odds · no backing out · result from on-chain randomness
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

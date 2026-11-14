import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useEffect } from 'react';
import { useChain } from '../../chain/useChain';
import { CARTELS, CARTEL_ORDER, type CartelId } from '../../game/config';
import { money } from '../../game/economy';
import { useGame } from '../../store/game';
import { HangTags } from '../jobs/HangTags';
import { JobModal } from '../jobs/JobModal';
import { Skyline } from './Skyline';
import { OnAir } from '../hud/Announcer';
import { useAnnouncer } from '../../game/announcer';
import { Vault } from './Vault';

function VaultSlot({ id }: { id: CartelId }) {
  const snap = useChain();
  const { target, phase, selectTarget, floater } = useGame();
  const c = CARTELS[id];
  const st = snap.cartels[id];
  const home = id === snap.player.cartel;
  const selected = target === id && phase !== 'idle';
  const stash = st.vault / st.maxVault;
  const hpColor = stash > 0.6 ? 'var(--green)' : stash > 0.3 ? 'var(--gold)' : 'var(--red)';
  const tag = home ? 'HOME' : selected ? 'TARGET' : 'RIVAL';
  const pointed = useAnnouncer((s) => s.pointAt === id);

  return (
    <div className="vault-slot" style={{ width: home ? 180 : 210 }} data-tut={home ? 'home-vault' : 'rival-vault'}>
      <button
        type="button"
        className="vault-btn float"
        style={{ animationDelay: `${c.floatDelay}s` }}
        disabled={home}
        onClick={() => selectTarget(id)}
        aria-label={home ? 'Your cartel vault' : `Case the ${c.ticker} vault`}
      >
        <AnimatePresence>
          {floater && floater.target === id && (
            <motion.div
              key={floater.key}
              className="damage"
              style={{ color: floater.good ? 'var(--red)' : 'var(--cyan)' }}
              initial={{ y: 30, opacity: 0, scale: 0.6 }}
              animate={{ y: -40, opacity: [0, 1, 1, 0], scale: 1 }}
              transition={{ duration: 1.6, ease: 'easeOut' }}
            >
              {floater.text}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="stash-row">
          <span><span className={`tag tag-${tag.toLowerCase()}`}>{tag}</span>STASH</span>
          <strong>{money(st.vault)}</strong>
        </div>
        <div className="bar"><div style={{ width: `${Math.max(0, Math.min(100, stash * 100))}%`, background: hpColor }} /></div>
        <div className="heat-row">
          {st.heat > 50 && (
            <>
              <span className="siren siren-a" />
              <span className="siren siren-b" />
              <span className="heat-text">HEAT {st.heat}%</span>
            </>
          )}
        </div>
        <div
          className={`vault-frame${pointed ? ' pointed' : ''}`}
          style={{ borderColor: selected ? c.neon : `${c.neon}66`, ['--glow' as string]: `${c.neon}${selected ? '88' : '40'}` }}
        >
          <Vault id={id} stashPct={stash} protection={st.protection} spinning={selected && phase === 'job'} />
        </div>
      </button>
      <div className="vault-shadow float-shadow" style={{ animationDelay: `${c.floatDelay}s` }} />
    </div>
  );
}

export function Scene() {
  const { phase, shakeKey } = useGame();
  const controls = useAnimationControls();
  useEffect(() => {
    if (shakeKey) controls.start({ x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.5 } });
  }, [shakeKey, controls]);

  return (
    <motion.section className="scene" animate={controls} aria-label="The city at night">
      <div className="moon" />
      <div className="moon-cut" />
      <Skyline />
      <div className="street-shade" />
      <OnAir />
      <p className="scene-hint">Click a rival vault to see the jobs. The ring around each door is its stash.</p>
      <div className="vault-row">
        {CARTEL_ORDER.map((id) => <VaultSlot key={id} id={id} />)}
      </div>
      <AnimatePresence>{phase === 'tags' && <HangTags key="tags" />}</AnimatePresence>
      <AnimatePresence>{(phase === 'job' || phase === 'result') && <JobModal key="job" />}</AnimatePresence>
    </motion.section>
  );
}

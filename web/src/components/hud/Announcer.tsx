import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useChain } from '../../chain/useChain';
import { say, useAnnouncer, warmAnnouncer } from '../../game/announcer';
import { CARTELS, CARTEL_ORDER, type CartelId } from '../../game/config';
import { useGame } from '../../store/game';
import { useTutorial } from './Tutorial';

const IDLE_MS = 22_000;     // street quiet this long -> nudge toward a vault
const NUDGE_EVERY_MS = 40_000;
const HEAT_EVERY_MS = 180_000;

/** Decides when the jazz announcer speaks. Renders nothing (the subtitle is <OnAir />). */
export function Announcer() {
  const snap = useChain();
  const { phase, outcome, revealed } = useGame();
  const tutorialOpen = useTutorial((s) => s.open);
  const ready = snap.session.status === 'ready';

  const lastActivity = useRef(Date.now());
  const lastNudge = useRef(0);
  const lastHeat = useRef(0);
  const welcomed = useRef(false);
  const countWarned = useRef(0);
  const latest = useRef(snap);
  latest.current = snap;

  // anything happening on the street counts as activity
  useEffect(() => { lastActivity.current = Date.now(); }, [phase]);

  // welcome, once, after the tutorial (audio needs the player's first click, so keep trying)
  useEffect(() => {
    if (!ready || tutorialOpen || welcomed.current) return;
    const t = setInterval(() => {
      if (welcomed.current) return clearInterval(t);
      warmAnnouncer();
      if (say('welcome', { priority: true, delay: 0.6 })) { welcomed.current = true; lastActivity.current = Date.now(); clearInterval(t); }
    }, 1500);
    return () => clearInterval(t);
  }, [ready, tutorialOpen]);

  // react to the player's own hit, after the ka-ching / trombone
  const reacted = useRef<number | null>(null);
  useEffect(() => {
    if (!revealed || !outcome || reacted.current === outcome.ticket.id) return;
    reacted.current = outcome.ticket.id;
    const streak = latest.current.player.streak + (outcome.win ? 1 : 0);
    if (outcome.win) {
      if (outcome.ticket.tierId === 2) say('bigwin', { priority: true, delay: 1.4 });
      else if (streak >= 3 && Math.random() < 0.6) say('streak', { priority: true, delay: 1.4 });
      else if (Math.random() < 0.75) say('win', { priority: true, delay: 1.4 });
    } else if (Math.random() < 0.6) say('bust', { priority: true, delay: 1.6 });
  }, [revealed, outcome]);

  // news: your vault got dumped, or the count landed
  const seen = useRef<Set<number> | null>(null);
  useEffect(() => {
    const ids = snap.news.map((n) => n.id);
    if (!seen.current) { if (ids.length) seen.current = new Set(ids); return; }
    const fresh = snap.news.filter((n) => !seen.current!.has(n.id));
    ids.forEach((id) => seen.current!.add(id));
    if (!ready || tutorialOpen) return;
    const myVault = `dumps ${CARTELS[snap.player.cartel].name} vault`;
    if (fresh.some((n) => n.bad && n.head.includes(myVault))) say('dumped', { priority: true, delay: 2.8 }); // after the headline chime
    else if (fresh.some((n) => n.head === 'The count is in')) say('count', { delay: 2.8 });
  }, [snap.news, ready, tutorialOpen, snap.player.cartel]);

  // the slow clock: idle nudges, heat warnings, count reminders
  useEffect(() => {
    const t = setInterval(() => {
      const s = latest.current;
      if (s.session.status !== 'ready' || useTutorial.getState().open || !welcomed.current) return;
      const now = Date.now();
      const me = s.cartels[s.player.cartel];

      const secsLeft = (s.countEndsAt - now) / 1000;
      if (secsLeft > 40 && secsLeft < 65 && countWarned.current !== s.countEndsAt) {
        if (say('count_soon')) countWarned.current = s.countEndsAt;
        return;
      }
      if (me.heat > 60 && me.protection === 0 && now - lastHeat.current > HEAT_EVERY_MS) {
        if (say('heat')) lastHeat.current = now;
        return;
      }
      if (useGame.getState().phase !== 'idle') return;
      if (now - lastActivity.current < IDLE_MS || now - lastNudge.current < NUDGE_EVERY_MS) return;

      // point at the juiciest unlocked rival: least protection first, then the fattest vault
      const rivals = CARTEL_ORDER.filter((id) => id !== s.player.cartel && s.cartels[id].vault > 0) as CartelId[];
      const target = rivals.sort((a, b) => s.cartels[a].protection - s.cartels[b].protection || s.cartels[b].vault - s.cartels[a].vault)[0];
      const ok = target && Math.random() < 0.75
        ? say(`nudge_${target}` as const, { pointAt: target })
        : say('idle');
      if (ok) lastNudge.current = now;
    }, 3000);
    return () => clearInterval(t);
  }, []);

  return null;
}

/** "ON AIR" subtitle while the announcer talks. */
export function OnAir() {
  const caption = useAnnouncer((s) => s.caption);
  return (
    <AnimatePresence>
      {caption && (
        <motion.div
          key={caption}
          className="onair"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
        >
          <span className="onair-badge"><span className="onair-dot" />ON AIR</span>
          <span className="onair-text">{caption}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

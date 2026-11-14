import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { useChain } from '../../chain/useChain';
import { CARTELS, CARTEL_ORDER, type CartelId } from '../../game/config';
import { money } from '../../game/economy';
import { useGame } from '../../store/game';
import { sfx } from '../../game/sfx';
import { Mascot } from '../scene/Mascot';
import { TapHand, VisCount, VisFaceoff, VisGo, VisOdds, VisRaid, VisShield, VisStash, VisWinBust } from './TutorialVisuals';

const DONE_KEY = 'dtu.tutorial.v2'; // v2: the visual tour (v1 players see it once more)
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Open/close the tour from anywhere (the header's "How to play" button). */
export const useTutorial = create<{ open: boolean; start: () => void; close: () => void }>((set) => ({
  open: false,
  start: () => set({ open: true }),
  close: () => { write(DONE_KEY, '1'); set({ open: false }); },
}));

interface Ctx { me: CartelId; cash: string }

interface Step {
  /** CSS selector of what to spotlight; none = centred card. */
  target?: string;
  sticker: string;
  stickerColor: string;
  title: (c: Ctx) => string;
  /** One short line. Pictures do the explaining. */
  line: (c: Ctx) => string;
  visual?: (c: Ctx) => ReactNode;
  /** Show a tapping hand on the target. */
  tap?: boolean;
  /** Interactive step: the player has to do this before moving on. */
  waitFor?: 'tags';
  /** Runs when leaving the step forward. */
  onNext?: () => void;
}

const STEPS: Step[] = [
  {
    sticker: 'GM', stickerColor: '#d4a53a',
    title: ({ me }) => `Welcome, ${CARTELS[me].name} crew`,
    line: () => 'Hit rival vaults. Dump their coin. Pump yours.',
    visual: ({ me, cash }) => <VisFaceoff me={me} cash={cash} />,
  },
  {
    target: '[data-tut="home-vault"]', sticker: 'HODL', stickerColor: '#7bd88f', tap: true,
    title: () => 'Your vault',
    line: () => 'Keep the ring full.',
    visual: ({ me }) => <VisStash me={me} />,
  },
  {
    target: '[data-tut="rival-vault"]', sticker: '👀', stickerColor: '#ff5fae', tap: true,
    title: () => 'Raid a rival vault',
    line: () => 'Hit it to grab their stash. Tap it to see the jobs.',
    visual: ({ me }) => <VisRaid me={me} rival={CARTEL_ORDER.find((c) => c !== me)!} />,
    waitFor: 'tags',
  },
  {
    target: '.scene', sticker: 'DEGEN', stickerColor: '#e0344a',
    title: () => 'Pick your raid',
    line: () => 'Lower odds, bigger loot. Tap a tag to raid.',
    visual: () => <VisOdds />,
    onNext: () => useGame.getState().closeTags(),
  },
  {
    sticker: 'WAGMI', stickerColor: '#7bd88f',
    title: () => 'Win or bust',
    line: ({ me }) => `Win: their coin is sold and swapped into ${CARTELS[me].ticker}.`,
    visual: ({ me }) => <VisWinBust me={me} />,
  },
  {
    target: '.count-panel .count-head', sticker: 'TICK', stickerColor: '#7bd88f', tap: true,
    title: () => 'The count',
    line: () => 'Every 15 min, winnings hit your vault.',
    visual: ({ me }) => <VisCount me={me} />,
  },
  {
    target: '.count-panel .btn-violet', sticker: 'COPIUM', stickerColor: '#b388ff', tap: true,
    title: () => 'Under attack?',
    line: () => 'Chip in for a shield.',
    visual: () => <VisShield />,
  },
  {
    sticker: 'LFG', stickerColor: '#e0344a',
    title: () => 'Go dump them',
    line: () => 'Replay this anytime: “How to play”.',
    visual: ({ me }) => <VisGo me={me} />,
  },
];

interface Rect { x: number; y: number; w: number; h: number }
const PAD = 8;
const CARD_W = 330;

function useTargetRect(selector?: string, active = true) {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!selector || !active) { setRect(null); return; }
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) {
        const r = el.getBoundingClientRect();
        const next = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
        const key = `${Math.round(next.x)},${Math.round(next.y)},${Math.round(next.w)},${Math.round(next.h)}`;
        if (key !== last) { last = key; setRect(next); }
      } else if (last !== 'none') { last = 'none'; setRect(null); }
      raf = requestAnimationFrame(tick);
    };
    const el = document.querySelector(selector);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    tick();
    return () => cancelAnimationFrame(raf);
  }, [selector, active]);
  return rect;
}

interface CardPos { left: number; w: number; top?: number; bottom?: number; maxH: number }

/** Below the target if it fits, else above it (anchored by its bottom edge, so its height doesn't
 *  matter), else inside a big target. maxHeight keeps it on screen whatever happens. */
function cardPosition(rect: Rect | null, cardH: number): CardPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  const SAFE = 24; // height can still change after measuring (fonts, wrapping)
  if (!rect) return { left: (vw - w) / 2, top: Math.max(12, (vh - cardH) / 2), w, maxH: vh - 24 };
  const left = Math.min(Math.max(12, rect.x + rect.w / 2 - w / 2), vw - w - 12);
  const below = vh - (rect.y + rect.h + 14) - 12;
  const above = rect.y - 14 - 12;
  if (below >= cardH + SAFE) return { left, top: rect.y + rect.h + 14, w, maxH: below };
  if (above >= cardH + SAFE) return { left, bottom: vh - rect.y + 14, w, maxH: above };
  // beside the target, vertically centred on it
  const sideTop = Math.min(Math.max(12, rect.y + rect.h / 2 - cardH / 2), vh - cardH - 12);
  if (rect.x + rect.w + 14 + w <= vw - 12) return { left: rect.x + rect.w + 14, top: sideTop, w, maxH: vh - 24 };
  if (rect.x - 14 - w >= 12) return { left: rect.x - 14 - w, top: sideTop, w, maxH: vh - 24 };
  // big target (the whole scene): sit inside it, near its bottom
  const bottom = Math.max(12, vh - (rect.y + rect.h) + 16);
  return { left, bottom, w, maxH: vh - bottom - 12 };
}

export function Tutorial() {
  const snap = useChain();
  const { phase } = useGame();
  const { open, start, close } = useTutorial();
  const [i, setI] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [cardH, setCardH] = useState(260);
  // re-place the card when the window changes size (phone rotation, resizing)
  const [, setViewport] = useState(0);
  useEffect(() => {
    const onResize = () => setViewport((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // first time a player is in the game for real: start the tour once
  const ready = snap.session.status === 'ready';
  useEffect(() => {
    if (ready && !read(DONE_KEY) && !open) { setI(0); start(); }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setI(0); }, [open]);

  const step = STEPS[i];
  const waiting = step?.waitFor === 'tags' && phase !== 'tags';
  const rect = useTargetRect(open ? step?.target : undefined, open);

  // interactive step: move on as soon as the player opens the job tags
  useEffect(() => {
    if (open && step?.waitFor === 'tags' && phase === 'tags') setI((n) => n + 1);
  }, [open, step, phase]);

  const finish = useCallback(() => {
    if (useGame.getState().phase === 'tags') useGame.getState().closeTags();
    close();
  }, [close]);

  const next = useCallback(() => {
    step?.onNext?.();
    if (i >= STEPS.length - 1) {
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors: ['#d4a53a', '#e0344a', '#7bd88f', '#ff5fae'] });
      }
      finish();
    } else setI(i + 1);
  }, [i, step, finish]);

  const back = () => {
    if (i === 0) return;
    let to = i - 1;
    const g = useGame.getState();
    // the jobs step only makes sense with the tags open: step back to "case a rival" instead
    if (STEPS[to].onNext && g.phase !== 'tags') to -= 1;
    // returning to the interactive step: close the tags so the player can open them again
    if (STEPS[to].waitFor && g.phase === 'tags') g.closeTags();
    setI(to);
  };

  // Each step remounts the card; watch its real size so tall cards aren't placed off-screen.
  const observer = useRef<ResizeObserver | null>(null);
  const setCardEl = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    setCardH(el.offsetHeight);
    observer.current = new ResizeObserver(() => setCardH(el.offsetHeight));
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  useEffect(() => { if (open) primaryRef.current?.focus(); }, [i, open]);
  // sticker slap on every step (sounds wait for the first user gesture anyway)
  useEffect(() => { if (open) sfx('slap', { delay: 0.15 }); }, [i, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open || !step || snap.session.status !== 'ready') return null;
  const me = snap.player.cartel;
  const ctx: Ctx = { me, cash: money(snap.player.cash) };
  const pos = cardPosition(rect, cardH);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // clicks pass through only the spotlight hole, and only on the interactive step
  const blockers = rect && waiting
    ? [
        { left: 0, top: 0, width: vw, height: Math.max(0, rect.y) },
        { left: 0, top: rect.y + rect.h, width: vw, height: Math.max(0, vh - rect.y - rect.h) },
        { left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.h },
        { left: rect.x + rect.w, top: rect.y, width: Math.max(0, vw - rect.x - rect.w), height: rect.h },
      ]
    : [{ left: 0, top: 0, width: vw, height: vh }];

  return (
    <div className="tut" role="dialog" aria-modal="true" aria-labelledby="tut-title">
      {blockers.map((b, k) => <div key={k} className="tut-block" style={b} />)}
      {rect ? (
        <motion.div
          className={`tut-hole${waiting ? ' tut-hole-live' : ''}`}
          animate={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          initial={false}
        />
      ) : (
        <div className="tut-dim" />
      )}
      {rect && step.tap && <TapHand x={rect.x + rect.w / 2 - 14} y={rect.y + rect.h - 30} />}

        <motion.div
          key={i}
          ref={setCardEl}
          className="tut-card"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.w, maxHeight: pos.maxH }}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          <motion.span
            className="tut-sticker"
            style={{ color: step.stickerColor, borderColor: step.stickerColor }}
            initial={{ scale: 2.2, rotate: -30, opacity: 0 }}
            animate={{ scale: 1, rotate: 9, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 13, delay: 0.12 }}
            aria-hidden="true"
          >
            {step.sticker}
          </motion.span>
          <div className="tut-head">
            <div className="tut-boss" style={{ borderColor: CARTELS[me].neon }}>
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 1.1, repeat: Infinity }}>
                <Mascot id={me} width={40} />
              </motion.div>
            </div>
            <div>
              <span className="tag-no">{i + 1} / {STEPS.length}</span>
              <h2 id="tut-title" className="tut-title">{step.title(ctx)}</h2>
            </div>
          </div>
          {step.visual && step.visual(ctx)}
          <p className="tut-body" aria-live="polite">{step.line(ctx)}</p>
          <div className="tut-dots" aria-hidden="true">
            {STEPS.map((_, k) => <span key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />)}
          </div>
          <div className="tut-actions">
            <button type="button" className="tut-skip" onClick={finish}>Skip tour</button>
            <span className="grow" />
            {i > 0 && <button type="button" className="btn btn-ghost tut-btn" onClick={back}>Back</button>}
            {waiting ? (
              <span className="tut-wait mono">Tap the glowing vault</span>
            ) : (
              <button ref={primaryRef} type="button" className="btn btn-gold tut-btn" onClick={next}>
                {i === STEPS.length - 1 ? 'Let’s dump' : i === 0 ? 'Show me' : 'Next'}
              </button>
            )}
          </div>
        </motion.div>
    </div>
  );
}

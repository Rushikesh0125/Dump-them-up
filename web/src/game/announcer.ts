// The jazz announcer: plays recorded lines (web/public/voice, see scripts/make-announcer.py) through
// the voice bus, ducks the music, shows an "ON AIR" subtitle, and never talks over himself.
import { create } from 'zustand';
import type { CartelId } from './config';
import { ANNOUNCER_LINES, type AnnouncerCategory } from './announcerLines';
import { audio, duckMusic, useSound } from './sfx';

/** What he's saying right now (for the subtitle) and which vault he's pointing at. */
export const useAnnouncer = create<{ caption: string | null; pointAt: CartelId | null }>(() => ({ caption: null, pointAt: null }));

const MIN_GAP_MS = 8000; // between remarks, unless it's a reaction to the player's own hit

const buffers = new Map<string, Promise<AudioBuffer | null>>();
function load(file: string) {
  let p = buffers.get(file);
  if (!p) {
    const g = audio();
    p = !g ? Promise.resolve(null) : fetch(`/voice/${file}.ogg`).then((r) => r.arrayBuffer()).then((b) => g.ctx.decodeAudioData(b)).catch(() => null);
    buffers.set(file, p);
  }
  return p;
}

// shuffle bag per category: every line once before any repeats
const bags = new Map<AnnouncerCategory, number[]>();
function nextLine(cat: AnnouncerCategory) {
  let bag = bags.get(cat);
  if (!bag || bag.length === 0) {
    bag = ANNOUNCER_LINES[cat].map((_, i) => i).sort(() => Math.random() - 0.5);
    bags.set(cat, bag);
  }
  return bag.pop()!;
}

interface Item { cat: AnnouncerCategory; pointAt: CartelId | null; delay: number; priority: boolean; queuedAt: number }

const PAUSE_MS = 700;     // breath between two lines
const STALE_MS = 15_000;  // a reaction that waited this long is old news: drop it
const MAX_QUEUE = 3;

// One shared on-air state, kept on globalThis so a hot-reloaded module can't start a second voice.
const air: { busy: boolean; lastEnd: number; queue: Item[]; pumpTimer: ReturnType<typeof setTimeout> | null } =
  ((globalThis as unknown as { __dtuOnAir?: typeof air }).__dtuOnAir ??= { busy: false, lastEnd: 0, queue: [], pumpTimer: null });

/**
 * Puts a line on air, one at a time: lines never overlap, they queue.
 * priority (reactions to the player's own play): queued behind whatever is playing.
 * otherwise (idle chatter): only goes out when he's silent, nothing is queued and the last line was a while ago.
 * Returns true if the line was accepted.
 */
export function say(cat: AnnouncerCategory, opts: { priority?: boolean; delay?: number; pointAt?: CartelId } = {}): boolean {
  const { muted, voice } = useSound.getState();
  if (muted || !voice) return false;
  const g = audio();
  if (!g || g.ctx.state !== 'running') return false; // audio not unlocked yet (no click so far)
  const priority = !!opts.priority;
  if (!priority && (air.busy || air.queue.length > 0 || Date.now() - air.lastEnd < MIN_GAP_MS)) return false;
  if (air.queue.some((q) => q.cat === cat)) return true; // already waiting
  const item: Item = { cat, pointAt: opts.pointAt ?? null, delay: opts.delay ?? 0, priority, queuedAt: Date.now() };
  // reactions jump ahead of any queued chatter, but never interrupt the line on air
  const at = priority ? air.queue.findIndex((q) => !q.priority) : -1;
  if (at >= 0) air.queue.splice(at, 0, item); else air.queue.push(item);
  if (air.queue.length > MAX_QUEUE) air.queue.length = MAX_QUEUE;
  pump();
  return true;
}

function pump() {
  if (air.busy || air.pumpTimer) return;
  const item = air.queue.shift();
  if (!item) return;
  if (Date.now() - item.queuedAt > STALE_MS || !useSound.getState().voice || useSound.getState().muted) return pump();
  const g = audio();
  if (!g) return;
  air.busy = true;
  const i = nextLine(item.cat);
  const done = () => {
    duckMusic(false);
    air.busy = false;
    air.lastEnd = Date.now();
    setTimeout(() => { if (!air.busy) useAnnouncer.setState({ caption: null, pointAt: null }); }, 500);
    // breathe, then the next line in the queue
    air.pumpTimer = setTimeout(() => { air.pumpTimer = null; pump(); }, PAUSE_MS);
  };
  load(`${item.cat}_${i + 1}`).then((buf) => {
    if (!buf || useSound.getState().muted || !useSound.getState().voice) return done();
    const src = g.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g.voiceBus);
    // if it waited in the queue, its "wait for the ka-ching first" delay has already passed
    const delay = Math.max(0, item.delay - (Date.now() - item.queuedAt) / 1000);
    src.start(g.ctx.currentTime + delay);
    setTimeout(() => {
      duckMusic(true);
      useAnnouncer.setState({ caption: ANNOUNCER_LINES[item.cat][i], pointAt: item.pointAt });
    }, delay * 1000);
    src.onended = done;
  });
}

/** Preload the lines most likely to be needed soon. */
export function warmAnnouncer() {
  ['welcome_1', 'welcome_2', 'win_1', 'bust_1', 'idle_1'].forEach(load);
}

if (import.meta.env.DEV) Object.assign(window, { __dtuSay: say }); // queue checks in dev

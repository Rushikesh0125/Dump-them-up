// Background music: a quiet noir-jazz loop generated live with Web Audio (no audio files).
// D minor, 84 bpm, swung 8ths. Walking upright bass, Rhodes-ish comping, brushes and ride.
// Plays through the music bus (see sfx.ts), so the header's music / sound toggles control it.
import { audio, useSound } from './sfx';

const BPM = 84;
const BEAT = 60 / BPM;
const SWING = 2 / 3; // the "and" lands two thirds into the beat
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// 8-bar progression: root (for the bass), chord quality, and a rootless mid-register voicing
const BARS: { root: number; third: number; voicing: number[] }[] = [
  { root: 38, third: 3, voicing: [53, 57, 60, 64] }, // Dm9
  { root: 38, third: 3, voicing: [53, 57, 60, 64] },
  { root: 43, third: 3, voicing: [53, 57, 58, 62] }, // Gm9
  { root: 43, third: 3, voicing: [53, 57, 58, 62] },
  { root: 34, third: 4, voicing: [50, 53, 57, 58] }, // Bbmaj7
  { root: 33, third: 4, voicing: [55, 58, 61, 64] }, // A7b9
  { root: 38, third: 3, voicing: [53, 57, 60, 64] }, // Dm9
  { root: 33, third: 4, voicing: [55, 58, 61, 64] }, // A7b9
];

let timer: ReturnType<typeof setInterval> | null = null;
let nextBeat = 0;
let beatIndex = 0;

function voice(at: number, freq: number, type: OscillatorType, peak: number, attack: number, decay: number, lowpass: number) {
  const g = audio();
  if (!g) return;
  const o = g.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = g.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const a = g.ctx.createGain();
  a.gain.setValueAtTime(0.0001, at);
  a.gain.exponentialRampToValueAtTime(peak, at + attack);
  a.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  o.connect(f).connect(a).connect(g.musicBus);
  o.start(at);
  o.stop(at + attack + decay + 0.05);
}

function hiss(at: number, peak: number, attack: number, decay: number, type: BiquadFilterType, freq: number, q = 0.7) {
  const g = audio();
  if (!g) return;
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const f = g.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const a = g.ctx.createGain();
  a.gain.setValueAtTime(0.0001, at);
  a.gain.exponentialRampToValueAtTime(peak, at + attack);
  a.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  src.connect(f).connect(a).connect(g.musicBus);
  src.start(at, Math.random() * 1.5);
  src.stop(at + attack + decay + 0.05);
}

function bass(at: number, note: number) {
  voice(at, midi(note), 'triangle', 0.55, 0.006, BEAT * 0.9, 520);
  voice(at, midi(note), 'sine', 0.35, 0.006, BEAT * 0.8, 300);
}

function rhodes(at: number, notes: number[], long: boolean) {
  notes.forEach((n, i) => {
    voice(at + i * 0.012, midi(n), 'sine', 0.09, 0.012, long ? 1.9 : 0.35, 2200);
    voice(at + i * 0.012, midi(n + 12), 'triangle', 0.02, 0.012, long ? 0.9 : 0.2, 2600);
  });
}

function scheduleBeat(at: number, i: number) {
  const barNo = Math.floor(i / 4) % BARS.length;
  const beat = i % 4;
  const bar = BARS[barNo];
  const next = BARS[(barNo + 1) % BARS.length];

  // walking bass: root, third, fifth, chromatic approach into the next bar
  const walk = [bar.root, bar.root + bar.third, bar.root + 7, next.root + (barNo % 2 ? -1 : 1)];
  bass(at, walk[beat]);

  // comping: a held chord on 1, a short stab on the swung "and" of 2 (most bars)
  if (beat === 0) rhodes(at, bar.voicing, true);
  if (beat === 1 && Math.random() < 0.6) rhodes(at + BEAT * SWING, bar.voicing, false);

  // ride: ding, ding-da, ding, ding-da
  hiss(at, 0.06, 0.002, 0.12, 'highpass', 7500);
  if (beat === 1 || beat === 3) hiss(at + BEAT * SWING, 0.035, 0.002, 0.08, 'highpass', 8000);

  // brushes on 2 and 4, feathered kick on 1 and 3
  if (beat === 1 || beat === 3) hiss(at, 0.09, 0.03, 0.22, 'bandpass', 2600, 0.6);
  else voice(at, 55, 'sine', 0.22, 0.004, 0.18, 200);
}

function tick() {
  const g = audio();
  if (!g) return;
  const { muted, music } = useSound.getState();
  const now = g.ctx.currentTime;
  if (nextBeat < now - 0.5) nextBeat = now + 0.1; // after a pause or a hidden tab, don't play catch-up
  while (nextBeat < now + 0.35) {
    if (!muted && music && !document.hidden) scheduleBeat(nextBeat, beatIndex);
    nextBeat += BEAT;
    beatIndex++;
  }
}

/** Starts the loop (call after the first user gesture). Safe to call more than once. */
export function startMusic() {
  if (timer || !audio()) return;
  nextBeat = audio()!.ctx.currentTime + 0.3;
  beatIndex = 0;
  timer = setInterval(tick, 60);
}

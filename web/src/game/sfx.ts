// Game audio. Two kinds of sound share one mix:
//  - samples: Kenney "Casino Audio" + "Interface Sounds" (CC0, see web/public/CREDITS.md)
//  - synth voices made here with Web Audio (coin tings, dial ratchet, ka-ching, sad trombone, ...)
// Everything goes sfx bus / music bus -> compressor -> master, so the game can be loud without
// clipping. The context starts on the first user gesture (browsers block audio before that).
import { create } from 'zustand';

type Sample = 'open' | 'commit' | 'toss' | 'win' | 'join' | 'shield' | 'slap' | 'pick';
type Synth = 'tink' | 'clink' | 'tick' | 'clunk' | 'swish' | 'pop' | 'kaching' | 'trombone' | 'extra' | 'creak' | 'alarm' | 'click';
export type Sfx = Sample | Synth;

const SYNTHS = new Set<Sfx>(['tink', 'clink', 'tick', 'clunk', 'swish', 'pop', 'kaching', 'trombone', 'extra', 'creak', 'alarm', 'click']);
const SAMPLE_VOL: Partial<Record<Sample, number>> = { slap: 0.8, commit: 0.75 };
const MUTE_KEY = 'dtu.muted';
const MUSIC_KEY = 'dtu.music';
const VOICE_KEY = 'dtu.voice';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export const useSound = create<{
  muted: boolean; music: boolean; voice: boolean;
  toggle: () => void; toggleMusic: () => void; toggleVoice: () => void;
}>((set, get) => ({
  muted: read(MUTE_KEY) === '1',
  music: read(MUSIC_KEY) !== '0', // on by default
  voice: read(VOICE_KEY) !== '0', // the announcer, on by default
  toggle: () => {
    const muted = !get().muted;
    write(MUTE_KEY, muted ? '1' : '0');
    set({ muted });
    applyLevels();
    if (!muted) sfx('click');
  },
  toggleMusic: () => {
    const music = !get().music;
    write(MUSIC_KEY, music ? '1' : '0');
    set({ music });
    applyLevels();
  },
  toggleVoice: () => {
    const voice = !get().voice;
    write(VOICE_KEY, voice ? '1' : '0');
    set({ voice });
    applyLevels();
  },
}));

// ------------------------------------------------------------------ graph

interface Graph { ctx: AudioContext; master: GainNode; sfxBus: GainNode; musicBus: GainNode; voiceBus: GainNode; noise: AudioBuffer }
let graph: Graph | null = null;
let ducked = false;
const VOICE_LEVEL = 0.045; // under the music: a radio in the back of the club
const DUCK = 0.85; // music barely dips while the announcer talks
const MUSIC_LEVEL = 0.11; // background: well under the effects
const SFX_LEVEL = 2.0;

export function audio(): Graph | null {
  if (!graph) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    const sfxBus = ctx.createGain();
    const musicBus = ctx.createGain();
    sfxBus.connect(comp);
    musicBus.connect(comp);
    const voiceBus = ctx.createGain();
    voiceBus.connect(comp);
    // brick-wall-ish limiter after the glue compressor, so loud hits never clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    comp.connect(limiter).connect(master).connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    graph = { ctx, master, sfxBus, musicBus, voiceBus, noise };
    applyLevels();
    if (import.meta.env.DEV) Object.assign(window, { __dtuAudio: graph, __dtuSfx: { sfx, useSound } }); // level checks in dev
  }
  if (graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => undefined);
  return graph;
}

function applyLevels() {
  if (!graph) return;
  const { muted, music, voice } = useSound.getState();
  const t = graph.ctx.currentTime;
  graph.master.gain.setTargetAtTime(muted ? 0 : 0.85, t, 0.05);
  graph.musicBus.gain.setTargetAtTime(music ? MUSIC_LEVEL * (ducked ? DUCK : 1) : 0, t, ducked ? 0.12 : 0.6);
  graph.voiceBus.gain.setTargetAtTime(voice ? VOICE_LEVEL : 0, t, 0.05);
  graph.sfxBus.gain.setTargetAtTime(SFX_LEVEL, t, 0.01);
}

// ------------------------------------------------------------------ samples

const buffers = new Map<Sample, Promise<AudioBuffer | null>>();
function load(name: Sample) {
  let p = buffers.get(name);
  if (!p) {
    const g = audio();
    p = !g
      ? Promise.resolve(null)
      : fetch(`/sfx/${name}.ogg`).then((r) => r.arrayBuffer()).then((b) => g.ctx.decodeAudioData(b)).catch(() => null);
    buffers.set(name, p);
  }
  return p;
}

function playSample(g: Graph, name: Sample, opts: { volume?: number; delay?: number; duration?: number }) {
  load(name).then((buf) => {
    if (!buf) return;
    const src = g.ctx.createBufferSource();
    const gain = g.ctx.createGain();
    gain.gain.value = opts.volume ?? SAMPLE_VOL[name] ?? 0.9;
    src.buffer = buf;
    src.connect(gain).connect(g.sfxBus);
    const at = g.ctx.currentTime + (opts.delay ?? 0);
    src.start(at);
    if (opts.duration) {
      gain.gain.setValueAtTime(gain.gain.value, at + opts.duration - 0.15);
      gain.gain.linearRampToValueAtTime(0, at + opts.duration);
      src.stop(at + opts.duration);
    }
  });
}

// ------------------------------------------------------------------ synth voices

type Env = { at: number; peak: number; attack?: number; decay: number };

function tone(g: Graph, type: OscillatorType, freq: number, e: Env, out: AudioNode = g.sfxBus, glideTo?: number) {
  const o = g.ctx.createOscillator();
  const a = g.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, e.at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, e.at + e.decay);
  a.gain.setValueAtTime(0.0001, e.at);
  a.gain.exponentialRampToValueAtTime(e.peak, e.at + (e.attack ?? 0.003));
  a.gain.exponentialRampToValueAtTime(0.0001, e.at + (e.attack ?? 0.003) + e.decay);
  o.connect(a).connect(out);
  o.start(e.at);
  o.stop(e.at + (e.attack ?? 0.003) + e.decay + 0.05);
  return o;
}

function noise(g: Graph, e: Env, filter: { type: BiquadFilterType; freq: number; q?: number; sweepTo?: number }, out: AudioNode = g.sfxBus) {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const f = g.ctx.createBiquadFilter();
  f.type = filter.type;
  f.frequency.setValueAtTime(filter.freq, e.at);
  if (filter.sweepTo) f.frequency.exponentialRampToValueAtTime(filter.sweepTo, e.at + e.decay);
  f.Q.value = filter.q ?? 1;
  const a = g.ctx.createGain();
  a.gain.setValueAtTime(0.0001, e.at);
  a.gain.exponentialRampToValueAtTime(e.peak, e.at + (e.attack ?? 0.003));
  a.gain.exponentialRampToValueAtTime(0.0001, e.at + (e.attack ?? 0.003) + e.decay);
  src.connect(f).connect(a).connect(out);
  src.start(e.at, Math.random() * 1.5);
  src.stop(e.at + (e.attack ?? 0.003) + e.decay + 0.05);
}

const jitter = (v: number, pct = 0.04) => v * (1 + (Math.random() * 2 - 1) * pct);

const VOICES: Record<Synth, (g: Graph, at: number) => void> = {
  // coin edge catching the light while it spins
  tink: (g, at) => {
    tone(g, 'sine', jitter(3150), { at, peak: 0.22, decay: 0.07 });
    tone(g, 'sine', jitter(5300), { at, peak: 0.08, decay: 0.05 });
  },
  // coin lands on the felt: metal ring, then a small bounce
  clink: (g, at) => {
    [2380, 3920, 6150].forEach((f, i) => tone(g, 'sine', f, { at, peak: [0.4, 0.22, 0.1][i], decay: 0.7 - i * 0.15 }));
    noise(g, { at, peak: 0.25, decay: 0.03 }, { type: 'highpass', freq: 4000 });
    [2380, 3920].forEach((f, i) => tone(g, 'sine', f * 1.01, { at: at + 0.14, peak: [0.18, 0.09][i], decay: 0.35 }));
  },
  // one dial notch passing the pointer
  tick: (g, at) => {
    noise(g, { at, peak: 1, decay: 0.022 }, { type: 'bandpass', freq: jitter(2600, 0.08), q: 1.6 });
    tone(g, 'square', jitter(1900), { at, peak: 0.12, decay: 0.014 });
    tone(g, 'triangle', jitter(950), { at, peak: 0.18, decay: 0.02 });
  },
  // a tumbler dropping into place
  clunk: (g, at) => {
    tone(g, 'sine', 140, { at, peak: 0.7, decay: 0.22 }, g.sfxBus, 55);
    noise(g, { at, peak: 0.5, decay: 0.08 }, { type: 'lowpass', freq: 700 });
    noise(g, { at: at + 0.01, peak: 0.25, decay: 0.03 }, { type: 'bandpass', freq: 3000, q: 3 });
  },
  // a bag sliding past another during the shuffle
  swish: (g, at) => noise(g, { at, peak: 1, attack: 0.03, decay: 0.14 }, { type: 'bandpass', freq: jitter(1300, 0.15), q: 0.9, sweepTo: 5200 }),
  // a bag torn open
  pop: (g, at) => {
    tone(g, 'sine', 220, { at, peak: 0.6, decay: 0.12 }, g.sfxBus, 80);
    noise(g, { at, peak: 0.45, decay: 0.16 }, { type: 'bandpass', freq: 1800, q: 0.8, sweepTo: 600 });
  },
  // cash register: drawer "cha" + bell "ching"
  kaching: (g, at) => {
    noise(g, { at, peak: 0.5, decay: 0.06 }, { type: 'bandpass', freq: 4200, q: 2 });
    noise(g, { at: at + 0.05, peak: 0.35, decay: 0.12 }, { type: 'bandpass', freq: 2200, q: 1.5 });
    const b = at + 0.12;
    [[1568, 0.38], [2093, 0.3], [3136, 0.12], [4186, 0.08]].forEach(([f, p]) => tone(g, 'sine', f, { at: b, peak: p, decay: 1.1 }));
    [[2093, 0.26], [2637, 0.2], [4186, 0.08]].forEach(([f, p]) => tone(g, 'sine', f, { at: b + 0.09, peak: p, decay: 1.2 }));
  },
  // wah wah wah waaah
  trombone: (g, at) => {
    const notes = [293.66, 277.18, 261.63, 246.94];
    notes.forEach((f, i) => {
      const t = at + i * 0.36;
      const len = i === 3 ? 1.05 : 0.32;
      const o = g.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      if (i === 3) {
        const lfo = g.ctx.createOscillator();
        const depth = g.ctx.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.value = 6;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t + 0.15);
        lfo.stop(t + len);
      }
      const f1 = g.ctx.createBiquadFilter();
      f1.type = 'lowpass';
      f1.Q.value = 6;
      f1.frequency.setValueAtTime(300, t);
      f1.frequency.linearRampToValueAtTime(1500, t + 0.09);
      f1.frequency.linearRampToValueAtTime(500, t + len);
      const a = g.ctx.createGain();
      a.gain.setValueAtTime(0.0001, t);
      a.gain.exponentialRampToValueAtTime(0.3, t + 0.04);
      a.gain.setValueAtTime(0.3, t + len - 0.06);
      a.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(f1).connect(a).connect(g.sfxBus);
      o.start(t);
      o.stop(t + len + 0.05);
    });
  },
  // EXTRA EXTRA: paper rustle + newsroom bell
  extra: (g, at) => {
    for (let i = 0; i < 6; i++) noise(g, { at: at + i * 0.045 + Math.random() * 0.02, peak: 0.22, decay: 0.05 }, { type: 'bandpass', freq: jitter(3600, 0.3), q: 1.2 });
    [[1318.5, 0.22], [2637, 0.1], [3951, 0.05]].forEach(([f, p]) => tone(g, 'sine', f, { at: at + 0.3, peak: p, decay: 1.3 }));
  },
  // vault door swinging open
  creak: (g, at) => {
    const o = g.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, at);
    o.frequency.linearRampToValueAtTime(140, at + 0.5);
    o.frequency.linearRampToValueAtTime(70, at + 0.8);
    const f = g.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 8;
    const a = g.ctx.createGain();
    a.gain.setValueAtTime(0.0001, at);
    a.gain.exponentialRampToValueAtTime(0.7, at + 0.1);
    a.gain.exponentialRampToValueAtTime(0.0001, at + 0.85);
    o.connect(f).connect(a).connect(g.sfxBus);
    o.start(at);
    o.stop(at + 0.9);
  },
  // UI button blip
  click: (g, at) => {
    tone(g, 'triangle', 1250, { at, peak: 0.3, decay: 0.045 }, g.sfxBus, 900);
    noise(g, { at, peak: 0.25, decay: 0.012 }, { type: 'highpass', freq: 3500 });
  },
  // safe alarm: two-tone beeps
  alarm: (g, at) => {
    for (let i = 0; i < 4; i++) tone(g, 'square', i % 2 ? 660 : 880, { at: at + i * 0.16, peak: 0.3, attack: 0.005, decay: 0.12 });
  },
};

/** Dip the music while the announcer talks. */
export function duckMusic(on: boolean) {
  ducked = on;
  applyLevels();
}

// ------------------------------------------------------------------ public

/** Plays a sound (no-op when muted or before audio is allowed). */
export function sfx(name: Sfx, opts: { volume?: number; delay?: number; duration?: number } = {}) {
  if (useSound.getState().muted) return;
  const g = audio();
  if (!g) return;
  if (SYNTHS.has(name)) VOICES[name as Synth](g, g.ctx.currentTime + 0.005 + (opts.delay ?? 0));
  else playSample(g, name as Sample, opts);
}

/** Starts audio on the first click anywhere (browsers require a gesture), then calls `onReady`. */
export function primeSfxOnFirstGesture(onReady?: () => void) {
  const prime = () => {
    window.removeEventListener('pointerdown', prime);
    window.removeEventListener('keydown', prime);
    if (!audio()) return;
    (['open', 'commit', 'win', 'pick'] as Sample[]).forEach(load);
    onReady?.();
  };
  window.addEventListener('pointerdown', prime);
  window.addEventListener('keydown', prime);
}

"""Records the jazz announcer with Piper (open-source TTS), voice "Norman" (public-domain LibriVox data),
pitched ~2 semitones down with a warm late-night-radio treatment.

Writes  web/public/voice/<category>_<n>.ogg   (one file per line)
        web/src/game/announcerLines.ts         (line texts per category, used for subtitles)

Setup (once, anywhere outside the repo):
    python -m venv piper-venv
    piper-venv/Scripts/python -m pip install piper-tts soundfile
    piper-venv/Scripts/python -m piper.download_voices en_US-norman-medium --download-dir voices
Run from the repo root:
    PYTHONUTF8=1 piper-venv/Scripts/python scripts/make-announcer.py <voices_dir>
Edit LINES below and re-run to change what he says.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from piper import PiperVoice, SynthesisConfig

VOICE = 'en_US-norman-medium'
PITCH = 1.12          # play back 12% slower: ~2 semitones deeper, pace restored by synthesizing faster
LENGTH_SCALE = 1.15   # base pace: a little slower than default, laid back

# category -> lines. {cartel} categories are per rival vault the announcer points at.
LINES = {
    'welcome': [
        'Good evening, night owls. This is Dump Them Up radio, and the vaults are wide open tonight.',
        'Well, well. Fresh muscle on the block. Pull up a chair, the night is young.',
    ],
    'nudge_dragon': [
        'The Black Dragon vault is fat and sleepy tonight. Go wake it up.',
        "Somebody ought to rattle the Dragon's door. Could be you, cat.",
        "That Black Dragon stash won't dump itself, baby.",
    ],
    'nudge_shitzu': [
        'The Shitzu vault is sitting heavy. Slide on over and lighten that load.',
        'Those Shitzu pups left the back door unlocked. Just saying.',
        "Shitzu's counting their coins. Go make them count again.",
    ],
    'nudge_neko': [
        'The NEKO cats are napping on a pile of coin. Go spoil their nap.',
        "NEKO's vault is purring. Make it hiss.",
        'Nine lives, one vault. Go crack the NEKO safe.',
    ],
    'idle': [
        "The night's not getting any younger. Pick a door and knock.",
        'Quiet out there. Too quiet. Somebody hit a vault already.',
        'Tap a rival vault, pick your job, and let the coins do the talking.',
    ],
    'win': [
        "Oh, smooth. Real smooth. That's how the pros dump a vault.",
        "Now that's music to my ears. Their coin sold, yours bought.",
        'Cha ching, baby. The whole block heard that one.',
        'Clean job. Not a fingerprint on it.',
    ],
    'bigwin': [
        'Nine and a half times! Somebody call the papers!',
        "They're gonna write songs about that safe, cat.",
    ],
    'bust': [
        "Oh. The door didn't swing your way. Shake it off.",
        'Busted. Happens to the best of us. Play another tune.',
        'Their coin just got a little fatter. Go get it back.',
        'Cold night at that door. Try a different vault.',
    ],
    'streak': [
        "You're on a hot streak, baby. Don't let the music stop.",
        "Three in a row. The whole city's whispering your name.",
    ],
    'heat': [
        "Heat's rising on your block. Might be time to buy some cover.",
        "They're coming for your vault. Chip in for protection.",
    ],
    'dumped': [
        'Somebody just dumped your vault. You gonna take that?',
        'Your stash took a hit. Time for some payback.',
    ],
    'count_soon': [
        'The count lands in a minute. Get your last jobs in.',
        "Clock's ticking, night owls. One more hit before the count.",
    ],
    'count': [
        'The count is in. Winnings are staked, the slate is clean.',
        "New count, new night. Who's running this city now?",
    ],
}


def synth(voice, text):
    cfg = SynthesisConfig(length_scale=LENGTH_SCALE / PITCH, noise_scale=0.6, noise_w_scale=0.7)
    parts = []
    for ch in voice.synthesize(text, syn_config=cfg):
        a = getattr(ch, 'audio_float_array', None)
        parts.append(a if a is not None else ch.audio_int16_array.astype(np.float32) / 32768)
    x = np.concatenate(parts)
    idx = np.arange(0, len(x) - 1, 1 / PITCH)  # slower playback = deeper voice
    return np.interp(idx, np.arange(len(x)), x).astype(np.float32)


def radio(x, sr):
    """Warm radio: band-limit 140 Hz - 5.5 kHz, presence + warmth bumps, tape saturation, small room."""
    pad = int(sr * 0.25)
    x = np.concatenate([x, np.zeros(pad, dtype=np.float32)])  # room tail
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / sr)
    hp = 1 / np.sqrt(1 + (140 / np.maximum(f, 1)) ** 4)
    lp = 1 / np.sqrt(1 + (f / 5500) ** 6)
    presence = 1 + 0.35 * np.exp(-((f - 2500) / 900) ** 2)
    warmth = 1 + 0.25 * np.exp(-((f - 220) / 120) ** 2)
    y = np.fft.irfft(X * hp * lp * presence * warmth, n)
    y = np.tanh(y * 1.8) / np.tanh(1.8)
    ir_len = int(sr * 0.35)
    t = np.arange(ir_len) / sr
    ir = np.random.default_rng(7).standard_normal(ir_len) * np.exp(-t / 0.08)
    ir[0] = 0
    wet = np.fft.irfft(np.fft.rfft(y, n + ir_len) * np.fft.rfft(ir, n + ir_len), n + ir_len)[:n]
    wet /= np.max(np.abs(wet)) + 1e-9
    y = y + 0.12 * wet
    return (y / (np.max(np.abs(y)) + 1e-9) * 0.89).astype(np.float32)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, 'web', 'public', 'voice')
    os.makedirs(out, exist_ok=True)
    voice = PiperVoice.load(os.path.join(sys.argv[1], VOICE + '.onnx'))
    sr = voice.config.sample_rate
    total = 0
    for cat, lines in LINES.items():
        for i, text in enumerate(lines, 1):
            y = radio(synth(voice, text), sr)
            path = os.path.join(out, f'{cat}_{i}.ogg')
            sf.write(path, y, sr, format='OGG', subtype='VORBIS')
            total += os.path.getsize(path)
    ts = os.path.join(root, 'web', 'src', 'game', 'announcerLines.ts')
    with open(ts, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Generated by scripts/make-announcer.py: edit the lines there and re-run.\n')
        fh.write('// Audio: web/public/voice/<category>_<n>.ogg (Piper TTS, voice "Norman", public domain).\n')
        fh.write('export const ANNOUNCER_LINES = ' + json.dumps(LINES, indent=2, ensure_ascii=False) + ' as const;\n\n')
        fh.write('export type AnnouncerCategory = keyof typeof ANNOUNCER_LINES;\n')
    print(f'{sum(len(v) for v in LINES.values())} lines, {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()

import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../game/sfx';
import { useGame } from '../../store/game';
import { easeOutCubic, useRaf } from './useRaf';

type Mode = 'spinning' | 'waiting' | 'landing' | 'done';

const DIAL = 'conic-gradient(#d4a53a 0deg 36deg, #2e2620 36deg 72deg, #3d3228 72deg 108deg, #2e2620 108deg 144deg, #3d3228 144deg 180deg, #2e2620 180deg 216deg, #3d3228 216deg 252deg, #2e2620 252deg 288deg, #3d3228 288deg 324deg, #2e2620 324deg 360deg)';

/** 9.5×: stop the dial on gold. The chain picks the segment; the dial slows onto it. */
export function CrackTheSafe() {
  const { play, reveal, outcome } = useGame();
  const [mode, setMode] = useState<Mode>('spinning');
  const [angle, setAngle] = useState(0);
  const [lights, setLights] = useState(0);
  const angleRef = useRef(0);
  angleRef.current = angle;
  const land = useRef({ from: 0, to: 0, t: 0 });

  // ratchet: one click per dial segment, so it slows down with the dial; a clunk per tumbler
  const seg = useRef(0);
  useEffect(() => {
    const s = Math.floor(angle / 36);
    if (s !== seg.current) { seg.current = s; sfx('tick'); }
  }, [angle]);
  useEffect(() => { if (lights > 0) sfx('clunk'); }, [lights]);

  useRaf(mode !== 'done', (dt) => {
    if (mode === 'spinning' || mode === 'waiting') {
      setAngle((a) => a + dt * (mode === 'spinning' ? 0.45 : 0.32));
      const o = useGame.getState().outcome;
      if (mode === 'waiting' && o) {
        const cur = angleRef.current;
        const base = Math.ceil((cur + 720) / 360) * 360;
        const j = 1 + Math.floor(Math.random() * 9);
        land.current = { from: cur, to: o.win ? base - 18 : base - (18 + 36 * j), t: 0 };
        setMode('landing');
      }
    } else if (mode === 'landing') {
      const L = land.current;
      L.t = Math.min(1, L.t + dt / 1500);
      setAngle(L.from + (L.to - L.from) * easeOutCubic(L.t));
      setLights(L.t < 0.34 ? 1 : L.t < 0.67 ? 2 : 3);
      if (L.t >= 1) {
        setMode('done');
        sfx(useGame.getState().outcome?.win ? 'creak' : 'alarm');
        reveal();
      }
    }
  });

  const stop = () => {
    if (mode !== 'spinning') return;
    setMode('waiting');
    play();
  };

  const done = mode === 'done' && outcome;
  const opened = !!(done && outcome.win);
  const alarm = !!(done && !outcome.win);

  return (
    <div className="game">
      <div className="safe">
        <div className="safe-inside">
          <span className="gold-bar" style={{ height: 26 }} />
          <span className="gold-bar gold-bar-hi" style={{ height: 40 }} />
          <span className="gold-bar" style={{ height: 30 }} />
        </div>
        <div className="safe-door" style={{ transform: `rotateY(${opened ? -78 : 0}deg)` }}>
          <span className="rivet" style={{ left: 8, top: 8 }} /><span className="rivet" style={{ right: 8, top: 8 }} />
          <span className="rivet" style={{ left: 8, bottom: 8 }} /><span className="rivet" style={{ right: 8, bottom: 8 }} />
          <div className="leds">
            {[1, 2, 3].map((n) => {
              const bad = alarm && n === 3;
              return <span key={n} className={`led ${bad ? 'blink' : ''}`} style={{ background: bad ? 'var(--red)' : lights >= n ? 'var(--green)' : '#2e2620' }} />;
            })}
          </div>
          <div className="dial-box">
            <div className="dial-pointer" />
            <div className="dial" style={{ background: DIAL, transform: `rotate(${angle}deg)` }} />
            <div className="dial-hub" />
          </div>
          <div className="safe-handle" />
        </div>
      </div>
      {alarm && <span className="alarm blink">ALARM</span>}
      <button type="button" className={`btn btn-red ${mode === 'spinning' ? 'pulse' : ''}`} onClick={stop} disabled={mode !== 'spinning'}>
        {mode === 'spinning' ? 'Stop the dial' : mode === 'waiting' ? 'Tumblers turning…' : 'Click… click…'}
      </button>
    </div>
  );
}

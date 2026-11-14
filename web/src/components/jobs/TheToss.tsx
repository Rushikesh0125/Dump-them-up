import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../game/sfx';
import { useGame } from '../../store/game';
import { Mascot } from '../scene/Mascot';
import { easeOutCubic, useRaf } from './useRaf';
import type { CartelId } from '../../game/config';

type Mode = 'idle' | 'spinning' | 'landing' | 'done';

/** 1.9×: flip the coin. Your boss face up = dump. The chain picks the face; the coin lands on it. */
export function TheToss({ me, them }: { me: CartelId; them: CartelId }) {
  const { play, reveal, outcome } = useGame();
  const [mode, setMode] = useState<Mode>('idle');
  const [angle, setAngle] = useState(0);
  const [hop, setHop] = useState(0);
  const land = useRef({ from: 0, to: 0, t: 0 });
  const angleRef = useRef(0);
  angleRef.current = angle;

  // a ting every half turn: fast while it flies, slowing down as it lands
  const halfTurn = useRef(0);
  useEffect(() => {
    const h = Math.floor(angle / 180);
    if (h !== halfTurn.current) { halfTurn.current = h; if (mode !== 'idle') sfx('tink'); }
  }, [angle, mode]);

  useRaf(mode === 'spinning' || mode === 'landing', (dt) => {
    if (mode === 'spinning') {
      setAngle((a) => a + dt * 1.1);
      setHop((h) => Math.min(1, h + dt / 300));
      const o = useGame.getState().outcome;
      if (o) {
        const cur = angleRef.current;
        const base = Math.ceil((cur + 720) / 360) * 360;
        land.current = { from: cur, to: base + (o.win ? 0 : 180), t: 0 };
        setMode('landing');
      }
    } else {
      const L = land.current;
      L.t = Math.min(1, L.t + dt / 950);
      const e = easeOutCubic(L.t);
      setAngle(L.from + (L.to - L.from) * e);
      setHop(L.t < 0.8 ? 1 - L.t / 0.8 : Math.sin(((L.t - 0.8) / 0.2) * Math.PI) * 0.12);
      if (L.t >= 1) { setHop(0); setMode('done'); sfx('clink'); reveal(); }
    }
  });

  const toss = () => {
    if (mode !== 'idle') return;
    setMode('spinning');
    play();
  };

  const lift = Math.sin((hop * Math.PI) / 2) * 100;
  const shadow = 110 - hop * 60;

  return (
    <div className="game">
      <div className="toss-table">
        <div className="felt" />
        <div className="coin-shadow" style={{ width: shadow, marginLeft: -shadow / 2 }} />
        <div className="coin-wrap" style={{ bottom: 30 + lift }}>
          <div className={mode === 'idle' ? 'wobble' : undefined}>
            <div className="coin" style={{ transform: `rotateY(${angle}deg)` }}>
              <div className="coin-face coin-front"><Mascot id={me} width={58} /></div>
              <div className="coin-face coin-back"><Mascot id={them} width={58} /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="chips">
        <span className="chip chip-good">YOUR BOSS = DUMP</span>
        <span className="chip chip-bad">THEIR BOSS = BUSTED</span>
      </div>
      <button type="button" className={`btn btn-gold ${mode === 'idle' ? 'pulse' : ''}`} onClick={toss} disabled={mode !== 'idle'}>
        {mode === 'idle' ? 'Toss it' : mode === 'spinning' && !outcome ? 'In the air…' : 'Landing…'}
      </button>
    </div>
  );
}

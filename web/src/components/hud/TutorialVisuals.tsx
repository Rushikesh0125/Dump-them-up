// Small animated pictures for the tutorial: each one explains a rule without a paragraph.
import { motion } from 'framer-motion';
import { CARTELS, CARTEL_ORDER, TIERS, type CartelId } from '../../game/config';
import { Mascot } from '../scene/Mascot';

const loop = { repeat: Infinity, repeatDelay: 0.6 };

/** The three cartels bounce in a face-off, plus the free bankroll. */
export function VisFaceoff({ me, cash }: { me: CartelId; cash: string }) {
  return (
    <div className="vis vis-faceoff">
      <div className="vis-row">
        {CARTEL_ORDER.map((id, i) => (
          <div key={id} className="vis-col">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 0.7, delay: i * 0.18, ...loop }}>
              <div className={`vis-portrait${id === me ? ' me' : ''}`} style={{ borderColor: CARTELS[id].neon }}>
                <Mascot id={id} width={id === me ? 40 : 32} />
              </div>
            </motion.div>
            <span className="vis-tick" style={{ color: CARTELS[id].neon }}>{id === me ? 'YOU' : CARTELS[id].ticker}</span>
          </div>
        ))}
      </div>
      <motion.div className="vis-stamp" initial={{ scale: 2, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 400, damping: 12 }}>
        {cash} free to start
      </motion.div>
    </div>
  );
}

/** The ring around a vault door drains as it gets dumped, and refills. */
export function VisStash({ me }: { me: CartelId }) {
  const C = 2 * Math.PI * 30;
  return (
    <div className="vis vis-split">
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r="30" fill="none" stroke="#d6c8a6" strokeWidth="9" />
        <motion.circle
          cx="42" cy="42" r="30" fill="none" stroke={CARTELS[me].neon} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={C} transform="rotate(-90 42 42)"
          animate={{ strokeDashoffset: [0, C * 0.55, C * 0.55, 0] }}
          transition={{ duration: 3.2, times: [0, 0.4, 0.6, 1], repeat: Infinity }}
        />
        <circle cx="42" cy="42" r="17" fill="#131726" />
        <foreignObject x="27" y="25" width="30" height="34"><Mascot id={me} width={30} /></foreignObject>
      </svg>
      <div className="vis-legend">
        <span><b style={{ color: '#2f7a46' }}>Full ring</b> = full vault</span>
        <span><b style={{ color: '#8a1c2b' }}>Shrinking</b> = getting dumped</span>
      </div>
    </div>
  );
}

/** Your boss raids a rival vault and the loot flies back to you. */
export function VisRaid({ me, rival }: { me: CartelId; rival: CartelId }) {
  return (
    <div className="vis vis-stack vis-raid">
      <div className="vis-raid-row">
        <motion.div className="vis-portrait me" style={{ borderColor: CARTELS[me].neon }} animate={{ x: [0, 46, 0] }} transition={{ duration: 1.6, times: [0, 0.35, 1], repeat: Infinity, repeatDelay: 0.4 }}>
          <Mascot id={me} width={28} />
        </motion.div>
        <div className="vis-raid-mid" aria-hidden="true">
          <motion.span className="vis-boom" animate={{ scale: [0, 1.4, 0], opacity: [0, 1, 0] }} transition={{ duration: 1.6, times: [0.3, 0.42, 0.6], repeat: Infinity, repeatDelay: 0.4 }}>💥</motion.span>
          {[0, 1, 2].map((k) => (
            <motion.span
              key={k} className="vis-coin" style={{ background: 'var(--gold)' }}
              animate={{ left: ['100%', '0%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1, delay: 0.7 + k * 0.15, repeat: Infinity, repeatDelay: 1, ease: 'easeIn' }}
            />
          ))}
        </div>
        <div className="vis-portrait" style={{ borderColor: CARTELS[rival].neon }}><Mascot id={rival} width={28} /></div>
      </div>
      <span className="vis-caption">Raid their vault → <b>loot is yours</b></span>
    </div>
  );
}

/** Three jobs as odds pies with their payout, all at the same 95% RTP. */
export function VisOdds() {
  const C = 2 * Math.PI * 16;
  return (
    <div className="vis vis-stack vis-odds">
      <div className="vis-row">
        {TIERS.map((t, i) => (
          <div key={t.id} className="vis-col">
            <svg width="48" height="48" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#d6c8a6" strokeWidth="8" />
              <motion.circle
                cx="20" cy="20" r="16" fill="none" stroke={t.stamp} strokeWidth="8" strokeDasharray={C} transform="rotate(-90 20 20)"
                initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - t.p) }}
                transition={{ delay: 0.2 + i * 0.25, duration: 0.7, ease: 'easeOut' }}
              />
            </svg>
            <span className="vis-mult" style={{ color: t.stamp }}>{t.label}</span>
            <span className="vis-small">{Math.round(t.p * 100)}% win</span>
          </div>
        ))}
      </div>
      <motion.div className="vis-rtp" initial={{ scale: 1.8, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -2 }} transition={{ delay: 1.1, type: 'spring', stiffness: 380, damping: 12 }}>
        <span className="vis-rtp-main">Every job · <b>95% RTP</b></span>
        <span>each hit: win big or lose your stake · ~95% back on average</span>
      </motion.div>
    </div>
  );
}

function Flow({ from, to, color, label, delay }: { from: React.ReactNode; to: React.ReactNode; color: string; label: string; delay: number }) {
  return (
    <div className="vis-flow">
      <span className="vis-flow-label" style={{ background: color }}>{label}</span>
      <div className="vis-flow-end">{from}</div>
      <div className="vis-flow-track" aria-hidden="true">
        {[0, 1, 2].map((k) => (
          <motion.span
            key={k} className="vis-coin" style={{ background: color }}
            animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, delay: delay + k * 0.45, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <div className="vis-flow-end">{to}</div>
    </div>
  );
}

/** Win: their coin flows into yours. Bust: your stake flows into theirs. */
export function VisWinBust({ me }: { me: CartelId }) {
  const rival = CARTEL_ORDER.find((c) => c !== me)!;
  // token chips with tickers, so it's obvious which coin gets sold and which gets bought
  const tok = (id: CartelId, note: string, good: boolean) => (
    <span className="vis-tok">
      <span className="vis-tok-chip" style={{ borderColor: CARTELS[id].neon, color: CARTELS[id].neon }}>{CARTELS[id].ticker}</span>
      <span className="vis-tok-note" style={{ color: good ? '#2f7a46' : '#8a1c2b' }}>{note}</span>
    </span>
  );
  return (
    <div className="vis vis-stack">
      <Flow label="WIN" color="#2f7a46" delay={0} from={tok(rival, 'sold', false)} to={tok(me, 'bought', true)} />
      <Flow
        label="BUST" color="#8a1c2b" delay={0.7}
        from={<span className="vis-tok"><span className="vis-cash">$</span><span className="vis-tok-note" style={{ color: '#8a1c2b' }}>stake</span></span>}
        to={tok(rival, 'bought', false)}
      />
    </div>
  );
}

/** A count ring ticks down, then the loot drops into your vault. */
export function VisCount({ me }: { me: CartelId }) {
  const C = 2 * Math.PI * 22;
  return (
    <div className="vis vis-split">
      <svg width="64" height="64" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="22" fill="none" stroke="#d6c8a6" strokeWidth="6" />
        <motion.circle
          cx="28" cy="28" r="22" fill="none" stroke="#2f7a46" strokeWidth="6" strokeDasharray={C} transform="rotate(-90 28 28)"
          animate={{ strokeDashoffset: [0, C] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        <text x="28" y="33" textAnchor="middle" fontFamily="Abril Fatface, serif" fontSize="14" fill="#1a1613">15m</text>
      </svg>
      <motion.span className="vis-cash big" animate={{ x: [0, 34, 34], opacity: [1, 1, 0], scale: [1, 1, 0.4] }} transition={{ duration: 3, times: [0.75, 0.92, 1], repeat: Infinity }}>
        +$
      </motion.span>
      <div className="vis-portrait me" style={{ borderColor: CARTELS[me].neon }}><Mascot id={me} width={34} /></div>
    </div>
  );
}

/** A shield drops onto the vault and the hitters' odds bar shrinks. */
export function VisShield() {
  return (
    <div className="vis vis-stack">
      <div className="vis-shield-row">
        <motion.svg width="38" height="44" viewBox="0 0 24 28" aria-hidden="true" animate={{ y: [-18, 0, 0, -18], opacity: [0, 1, 1, 0] }} transition={{ duration: 3.4, times: [0, 0.2, 0.85, 1], repeat: Infinity }}>
          <path d="M12 1 L22 5 V13 C22 20 17 25 12 27 C7 25 2 20 2 13 V5 Z" fill="#b388ff" stroke="#5b3a9a" strokeWidth="2" />
          <path d="M8 14 l3 3 5-6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </motion.svg>
        <div className="vis-bar-wrap">
          <span className="vis-small">hitters’ odds on your vault</span>
          <div className="vis-bar">
            <motion.div animate={{ width: ['100%', '60%', '60%', '100%'] }} transition={{ duration: 3.4, times: [0.15, 0.3, 0.85, 1], repeat: Infinity }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Finale: your boss, jumping. */
export function VisGo({ me }: { me: CartelId }) {
  return (
    <div className="vis vis-go">
      <motion.div animate={{ y: [0, -14, 0], rotate: [0, -6, 6, 0] }} transition={{ duration: 0.6, ...loop }}>
        <div className="vis-portrait me" style={{ borderColor: CARTELS[me].neon }}><Mascot id={me} width={48} /></div>
      </motion.div>
    </div>
  );
}

/** Pointing hand that taps a spot on screen. */
export function TapHand({ x, y }: { x: number; y: number }) {
  return (
    <motion.div className="tut-hand" style={{ left: x, top: y }} animate={{ y: [0, -10, 0], scale: [1, 0.9, 1] }} transition={{ duration: 0.9, repeat: Infinity }} aria-hidden="true">
      👆
    </motion.div>
  );
}

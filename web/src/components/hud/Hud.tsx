import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { chain, useChain } from '../../chain/useChain';
import { CARTELS, CARTEL_ORDER, RESPECT_PER_LEVEL, rankFor } from '../../game/config';
import { money } from '../../game/economy';
import { Mascot } from '../scene/Mascot';
import { useTutorial } from './Tutorial';
import { sfx, useSound } from '../../game/sfx';

function useCountdown(endsAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((endsAt - now) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function VoiceToggle() {
  const { voice, muted, toggleVoice } = useSound();
  const on = voice && !muted;
  return (
    <button type="button" className={`how-to sound-toggle${on ? '' : ' off'}`} onClick={toggleVoice} aria-pressed={voice} aria-label={voice ? 'Turn the announcer off' : 'Turn the announcer on'} title={voice ? 'Announcer on' : 'Announcer off'}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        {!voice && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}

function MusicToggle() {
  const { music, muted, toggleMusic } = useSound();
  const on = music && !muted;
  return (
    <button type="button" className={`how-to sound-toggle${on ? '' : ' off'}`} onClick={toggleMusic} aria-pressed={music} aria-label={music ? 'Turn music off' : 'Turn music on'} title={music ? 'Music on' : 'Music off'}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9 18a3 3 0 1 1-2-2.83V5l12-2v11a3 3 0 1 1-2-2.83V6.2L9 7.5z" />
        {!music && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
      </svg>
    </button>
  );
}

function SoundToggle() {
  const { muted, toggle } = useSound();
  return (
    <button type="button" className="how-to sound-toggle" onClick={toggle} aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} title={muted ? 'Sound off' : 'Sound on'}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
}

export function Header() {
  const snap = useChain();
  const boss = CARTEL_ORDER.reduce((a, b) => (snap.dumpsThisCount[a] >= snap.dumpsThisCount[b] ? a : b));
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">DUMP <span>THEM</span> UP</span>
        <span className="tagline">a memecoin cartel war</span>
      </div>
      <div className="boss-banner">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#d4a53a" aria-hidden="true"><path d="M3 18h18l-1-11-5 4-3-7-3 7-5-4z" /></svg>
        <span className="boss-label">Boss of the City:</span>
        <strong>{CARTELS[boss].ticker} cartel</strong>
        <span className="muted">{snap.dumpsThisCount[boss]} dumps tonight</span>
      </div>
      {snap.session.status === 'ready' && (
        <div className="top-actions">
          <VoiceToggle />
          <MusicToggle />
          <SoundToggle />
          <button type="button" className="how-to" onClick={() => { sfx('click'); useTutorial.getState().start(); }}>
            <span aria-hidden="true">?</span> How to play
          </button>
        </div>
      )}
    </header>
  );
}

const coins = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e5 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString('en-US');

/** The player's memecoins: rewards are paid in their cartel's coin, staked at the count. */
function CoinPanel() {
  const { player } = useChain();
  const h = player.holdings;
  const c = CARTELS[h.coin];
  const total = h.wallet + (h.staked ?? 0) + h.pending;
  return (
    <div className="coins">
      <div className="row-between">
        <span className="mono tiny muted">YOUR COINS</span>
        {h.price > 0 && <span className="mono tiny muted">≈ {money(total * h.price)}</span>}
      </div>
      <div className="coins-main">
        <span className="coins-chip" style={{ borderColor: c.neon, color: c.neon }}>
          <Mascot id={h.coin} width={18} />
          {c.ticker}
        </span>
        <strong className="coins-total display">{coins(total)}</strong>
        <AnimatePresence>
          {h.pending > 0 && (
            <motion.span key={Math.round(h.pending)} className="coins-pop mono" initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
              +{coins(h.pending)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="coins-split mono tiny">
        <span title="Coins held directly">wallet <b>{coins(h.wallet)}</b></span>
        <span title="Coins staked for you in your cartel's vault">staked <b>{h.staked === null ? '…' : coins(h.staked)}</b></span>
        <span className={h.pending > 0 ? 'coins-incoming' : 'muted'} title="Loot from tonight's wins, staked for you at the count">
          at the count <b>+{coins(h.pending)}</b>
        </span>
      </div>
      {h.others.length > 0 && (
        <div className="coins-others mono tiny muted">
          also holding {h.others.map((o) => `${coins(o.amount)} ${CARTELS[o.coin].ticker}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

function SignOut() {
  const { session } = useChain();
  const [busy, setBusy] = useState(false);
  if (session.network === 'mock' || !session.accountId) return null; // nobody signed in (or the offline mock)
  const hint =
    session.login === 'guest' ? 'Sign out. Your guest account stays in this browser: “Play now as a guest” brings it back.'
    : session.login === 'email' ? 'Sign out of your email / Google account'
    : 'Disconnect your wallet';
  return (
    <button
      type="button"
      className="signout"
      title={hint}
      aria-label={hint}
      disabled={busy}
      onClick={async () => { setBusy(true); sfx('click'); try { await chain.disconnect(); } finally { setBusy(false); } }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
      </svg>
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

export function BossCard() {
  const { player } = useChain();
  return (
    <div className="panel boss-card">
      <div className="portrait-lg" style={{ borderColor: CARTELS[player.cartel].neon }}>
        <Mascot id={player.cartel} width={66} label={`Your boss, ${CARTELS[player.cartel].name} cartel`} />
      </div>
      <div className="boss-info">
        <div className="boss-name-row">
          <strong className="display">{player.account}</strong>
          <SignOut />
        </div>
        <span className="rank">{rankFor(player.level)} · LV {player.level} · {CARTELS[player.cartel].name} cartel</span>
        <div className="bar"><div style={{ width: `${(player.respect / RESPECT_PER_LEVEL) * 100}%`, background: 'var(--gold)' }} /></div>
        <div className="row-between mono small muted">
          <span>{player.respect} / {RESPECT_PER_LEVEL} respect</span>
          <span style={{ color: '#ff8a5c' }}>{player.streak} hot streak</span>
        </div>
        <div className="row-between mono small">
          <span className="muted">Cash for jobs</span><strong>{money(player.cash)}</strong>
        </div>
        <CoinPanel />
      </div>
    </div>
  );
}

export function CountPanel() {
  const snap = useChain();
  const p = snap.player;
  const countdown = useCountdown(snap.countEndsAt);
  const active = snap.cartels[p.cartel].protection >= 2;
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    try { await chain.payProtection(50); sfx('shield'); } finally { setBusy(false); }
  };
  return (
    <div className="panel count-panel">
      <div className="count-head">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#7bd88f" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M10 2h4" /></svg>
        <div>
          <span className="mono small muted">THE COUNT IN</span>
          <div className="display count">{countdown}</div>
        </div>
      </div>
      <div className="row-between mono"><span className="muted">Tonight’s take</span><strong style={{ color: 'var(--green)' }}>+{money(p.take)}</strong></div>
      <div className="row-between mono"><span className="muted">Hopium Cover (tier 2)</span><strong style={{ color: 'var(--violet)' }}>{active ? 'ACTIVE' : `${Math.round((p.protectionPaid / p.protectionPrice) * 100)}% paid`}</strong></div>
      <div className="bar"><div style={{ width: `${Math.min(100, (p.protectionPaid / p.protectionPrice) * 100)}%`, background: 'var(--violet)' }} /></div>
      <button type="button" className="btn btn-violet" onClick={pay} disabled={busy || active}>
        {active ? 'Covered until the count' : 'Pay protection · $50'}
      </button>
      <span className="mono tiny muted">More hits on the block, pricier protection.</span>
    </div>
  );
}

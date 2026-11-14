import { useState } from 'react';
import { chain, useChain } from '../../chain/useChain';
import { CARTELS, CARTEL_ORDER, type CartelId } from '../../game/config';
import { money } from '../../game/economy';
import { Mascot } from '../scene/Mascot';
import { sfx } from '../../game/sfx';

/** Shown over the game until the player is connected and has picked a cartel. */
export function Gate() {
  const snap = useChain();
  const [busy, setBusy] = useState<CartelId | 'guest' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { status } = snap.session;
  if (status === 'ready') return null;

  const join = async (id: CartelId) => {
    setBusy(id);
    setError(null);
    try {
      await chain.joinCartel(id);
      sfx('join');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const signIn = async (how: 'guest' | 'email') => {
    setBusy(how);
    setError(null);
    try {
      await (how === 'guest' ? chain.playAsGuest() : chain.signInWithEmail());
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== 'Sign-in cancelled') setError(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-label="Join the war">
      <div className="gate-card">
        <div className="logo">DUMP <span>THEM</span> UP</div>
        {status === 'loading' && <p className="mono muted">Loading the city…</p>}
        {status === 'loading' && snap.session.error && <p className="gate-error" role="alert">{snap.session.error}</p>}
        {status === 'disconnected' && (
          <>
            <p className="gate-lead">Memecoin cartels hit each other’s vaults. Jump in and pick a side.</p>
            <div className="gate-logins">
              <button type="button" className="btn btn-gold" onClick={() => signIn('guest')} disabled={busy !== null}>
                {busy === 'guest' ? 'Setting up…' : 'Play now as a guest'}
              </button>
              {chain.emailLogin && (
                <button type="button" className="btn btn-ghost" onClick={() => signIn('email')} disabled={busy !== null}>
                  {busy === 'email' ? 'Signing in…' : 'Sign in with email or Google'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => chain.connect()} disabled={busy !== null}>
                Connect your own wallet
              </button>
            </div>
            {snap.session.notice && <p className="mono small muted" role="status">{snap.session.notice}</p>}
            {error && <p className="gate-error" role="alert">{error}</p>}
            <p className="mono tiny muted">
              No wallet needed: guests play from a key kept in this browser{chain.emailLogin ? ', email keeps your account across devices' : ''}. Gas is on the house.
            </p>
          </>
        )}
        {status === 'no-cartel' && (
          <>
            <p className="gate-lead">Pick your cartel. New members get $2,500 testnet mUSD and 10,000 coins to start.</p>
            <div className="gate-cartels">
              {CARTEL_ORDER.map((id) => (
                <button key={id} type="button" className="gate-cartel" style={{ borderColor: CARTELS[id].neon }} onClick={() => join(id)} disabled={busy !== null}>
                  <Mascot id={id} width={54} />
                  <strong style={{ color: CARTELS[id].neon }}>{CARTELS[id].ticker}</strong>
                  <span className="mono small muted">vault {money(snap.cartels[id].vault)} · {snap.cartels[id].members} members</span>
                  <span className="mono small">{busy === id ? 'Joining…' : 'Join'}</span>
                </button>
              ))}
            </div>
            {error && <p className="gate-error" role="alert">{error}</p>}
            <button type="button" className="btn btn-ghost" onClick={() => chain.disconnect()}>Use another account</button>
          </>
        )}
      </div>
    </div>
  );
}

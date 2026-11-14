// Email / Google sign-in through Privy. Loaded lazily (only when a Privy app id is set) and mounted
// beside the app: it renders no UI of its own besides Privy's modal, and hands NearChain a NEAR
// wallet + signer once the player is signed in.
import { useEffect, useRef } from 'react';
import { PrivyProvider, useLogin, usePrivy } from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';
import type { NearChain } from './nearChain';

function Bridge({ chain }: { chain: NearChain }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const { login } = useLogin({ onError: (e) => chain.privyFailed(new Error(String(e) === 'exited_auth_flow' ? 'Sign-in cancelled' : String(e))) });

  const sign = useRef(signRawHash);
  sign.current = signRawHash;

  useEffect(() => {
    chain.registerPrivy({ login: () => login(), logout });
  }, [chain, login, logout]);

  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    let cancelled = false;
    (async () => {
      const linked = user.linkedAccounts.find((a) => a.type === 'wallet' && 'chainType' in a && a.chainType === 'near') as { address: string } | undefined;
      const address = linked?.address ?? (await createWallet({ chainType: 'near' })).wallet.address;
      if (cancelled) return;
      await chain.attachPrivy(address, async (hash) => (await sign.current({ address, chainType: 'near', hash })).signature);
    })().catch((e) => chain.privyFailed(e instanceof Error ? e : new Error(String(e))));
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function PrivyBridge({ appId, chain }: { appId: string; chain: NearChain }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'google'],
        appearance: { theme: 'dark', accentColor: '#e0b84a', landingHeader: 'Join the cartel war', showWalletLoginFirst: false },
      }}
    >
      <Bridge chain={chain} />
    </PrivyProvider>
  );
}

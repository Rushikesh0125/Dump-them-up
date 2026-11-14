import './polyfills';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/abril-fatface';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';
import App from './App';
import { primeSfxOnFirstGesture } from './game/sfx';
import { startMusic } from './game/music';

primeSfxOnFirstGesture(startMusic);
import { nearChain, PRIVY_APP_ID } from './chain/useChain';

const PrivyBridge = lazy(() => import('./chain/PrivyBridge'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {nearChain && PRIVY_APP_ID && (
      <Suspense fallback={null}>
        <PrivyBridge appId={PRIVY_APP_ID} chain={nearChain} />
      </Suspense>
    )}
  </StrictMode>,
);

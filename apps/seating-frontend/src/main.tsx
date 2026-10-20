import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { configureWorkerClient, registerRuntimeEnv } from '@classprints/shared';
import { configureAuthSession } from '@classprints/shared/auth';
import { App } from './App';
import { reloadForNewVersion } from './lib/chunk-reload';

import './styles/globals.css';

// Register Vite environment variables so they are accessible to @classprints/shared.
registerRuntimeEnv(import.meta.env as unknown as Record<string, string>);

configureAuthSession({
  accessTokenCookie: 'seating_access_token',
  refreshTokenCookie: 'seating_refresh_token',
  csrfCookie: 'seating_csrf_token',
});

// No base-URL env keys: the API is reached same-origin (the frontend asset
// worker forwards `/api/*` to classprints-api via a service binding). Session
// cookies are only first-party in that mode, which is what lets the session
// survive a page refresh.
configureWorkerClient({
  apiPrefix: '/api/v1',
});

// Vite fires this when a lazy chunk or its CSS fails to load, typically a
// stale tab after a deploy. Reload to pick up the new build; the cooldown
// stops a genuinely broken chunk from looping, in which case the route's
// error component takes over.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { configureWorkerClient, registerRuntimeEnv } from '@classprints/shared';
import { configureAuthSession } from '@classprints/shared/auth';
import { App } from './App';

import './styles/globals.css';

// Register Vite environment variables so they are accessible to @classprints/shared.
registerRuntimeEnv(import.meta.env as unknown as Record<string, string>);

configureAuthSession({
  accessTokenCookie: 'seating_access_token',
  refreshTokenCookie: 'seating_refresh_token',
  csrfCookie: 'seating_csrf_token',
});

configureWorkerClient({
  baseUrlEnvKeys: [
    'VITE_WORKER_BASE_URL',
    'VITE_SEATING_API_URL',
    'SEATING_API_URL',
    'VITE_API_BASE_URL',
    'API_BASE_URL',
  ],
  localDevPort: 8787,
  apiPrefix: '/api/v1',
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

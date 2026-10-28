import * as React from 'react';
import { createRoot } from 'react-dom/client';
import AppV2 from './AppV2';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import { installClientMonitoring } from './lib/clientMonitoring';
import './v2.css';
import './v2-client-refresh.css';

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root.');
const rootInstance = createRoot(root);
rootInstance.render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <AppV2 />
    </GlobalErrorBoundary>
  </React.StrictMode>,
);

installClientMonitoring();

// Enables the installable PWA shell; API requests and personalized pages are never cached by the worker.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('System Formy: nie udało się zarejestrować trybu aplikacji PWA.', error);
    });
  }, { once: true });
}

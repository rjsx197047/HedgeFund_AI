import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installBrowserBridgeMockIfNeeded } from './lib/browser-bridge-mock';
import './index.css';

// In Electron the preload script populates `window.tradingAgentsLab` before
// the renderer scripts run. In a plain browser (e.g. when an external UI
// testing agent points at the Vite dev URL) the bridge is absent — install
// a no-op shim so navigation doesn't crash on first interaction.
installBrowserBridgeMockIfNeeded();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// PWA: Register Service Worker
import { registerSW } from 'virtual:pwa-register';

// Automatically reload if a new version is available
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './app.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register the service worker. Without this, /share-target POSTs go straight
// to static hosting and fail — the SW is what makes the share sheet work.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Non-fatal: paste/upload still work without a SW.
      console.warn('service worker registration failed:', err);
    });
  });
}

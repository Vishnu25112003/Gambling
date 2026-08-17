import { Buffer } from 'buffer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Some Solana wallet-adapter dependencies still expect a Node-ish global.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).global ||= window;
// ...and reach for a bare `Buffer` when serializing transactions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).Buffer ||= Buffer;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

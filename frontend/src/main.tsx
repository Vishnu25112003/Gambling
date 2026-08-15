import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Some Solana wallet-adapter dependencies still expect a Node-ish global.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).global ||= window;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

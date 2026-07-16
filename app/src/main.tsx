import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { App } from './App';
import { bootstrapWorld } from './data/live';

// In live mode, hydrate the world from the control-plane server before the first
// render so every synchronous store read sees real data. In mock mode this
// resolves immediately and the deterministic world renders offline.
bootstrapWorld().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

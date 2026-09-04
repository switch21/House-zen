import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { RootErrorBoundary } from '@/app/router/RootErrorBoundary';
import '@/styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    {/* Outermost boundary: guarantees visible fallback even if a provider in
        <App /> crashes (no more silent white screen in production). */}
    <RootErrorBoundary scope="bootstrap">
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);

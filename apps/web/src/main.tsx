import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { configureFromBridge } from './bootstrap';
import './types/zwaggen-bridge';
import { setProxyUrl } from '@zwaggen/core';

// MUST run before render. Components capture the active storage/transport on
// their first hook call; if configureFromBridge ran later, the desktop shell
// would silently fall back to browser defaults for whatever loaded first.
if (typeof window !== 'undefined' && window.zwaggen) {
  configureFromBridge(window.zwaggen);
}

// `npx @zwaggen/web` injects __ZWAGGEN_BUNDLED_PROXY__ in the served
// index.html. Its value (e.g. '/proxy') is informational — it tells the
// SPA "the bundled proxy is mounted at this path on the same origin."
// The actual setProxyUrl arg is the BASE URL of the proxy server (with no
// '/proxy' suffix — runner/send.ts appends `/proxy?url=…` itself). For
// the bundled case the base is empty (same-origin), so setProxyUrl('').
// Hosted play.zwaggen.com leaves the hint undefined → standalone default.
const bundledProxyHint =
  typeof window !== 'undefined' &&
  typeof (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__ === 'string'
    ? (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__
    : null;
if (bundledProxyHint) setProxyUrl('');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

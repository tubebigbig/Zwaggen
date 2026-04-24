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

// `npx @zwaggen/web` injects this in the served index.html so the runner's
// proxy URL becomes same-origin (e.g. '/proxy') instead of the standalone
// 'http://localhost:4801'. Hosted play.zwaggen.com leaves it undefined.
const bundledProxy =
  typeof window !== 'undefined' &&
  typeof (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__ === 'string'
    ? (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__
    : null;
if (bundledProxy) setProxyUrl(bundledProxy);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

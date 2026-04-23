import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { configureFromBridge } from './bootstrap';
import './types/zwaggen-bridge';

if (typeof window !== 'undefined' && window.zwaggen) {
  configureFromBridge(window.zwaggen);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

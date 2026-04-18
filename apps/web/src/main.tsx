import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

import '@testing-library/jest-dom/vitest';
import '../src/i18n';
import { setUiPref } from '../src/state/uiPrefs';

// jsdom doesn't implement window.matchMedia. Provide a minimal stub so any
// component that calls useBreakpoint (e.g. App) can render without crashing.
// Tests that need real media-query behaviour install their own mock per-test.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  (window as any).matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  } as unknown as MediaQueryList);
}

// Tests render panels directly and expect the full content, so force-expand
// the Types drawer in every test (its default is collapsed for real users).
beforeEach(() => {
  setUiPref('typesCollapsed', false);
});

// jsdom 24 doesn't implement Blob.prototype.text / arrayBuffer. Polyfill for tests.
if (typeof Blob !== 'undefined' && typeof (Blob.prototype as any).text !== 'function') {
  (Blob.prototype as any).text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ''));
      r.onerror = () => reject(r.error);
      r.readAsText(this);
    });
  };
}
if (typeof Blob !== 'undefined' && typeof (Blob.prototype as any).arrayBuffer !== 'function') {
  (Blob.prototype as any).arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}

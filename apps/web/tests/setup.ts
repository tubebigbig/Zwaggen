import '@testing-library/jest-dom/vitest';

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

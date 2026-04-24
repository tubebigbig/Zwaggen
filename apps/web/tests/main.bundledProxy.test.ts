import { afterEach, beforeEach, expect, test } from 'vitest';
import { getProxyUrl, resetProxyUrl, setProxyUrl } from '@zwaggen/core';

beforeEach(() => resetProxyUrl());
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__ZWAGGEN_BUNDLED_PROXY__;
  resetProxyUrl();
});

// Re-importing main.tsx is messy (it kicks ReactDOM.createRoot at module load)
// so we replicate the probe to lock its semantics in.
function probe(): void {
  const bundledProxy =
    typeof window !== 'undefined' &&
    typeof (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__ === 'string'
      ? (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__
      : null;
  if (bundledProxy) setProxyUrl(bundledProxy);
}

test('main.tsx-style probe reads __ZWAGGEN_BUNDLED_PROXY__ and calls setProxyUrl', () => {
  (window as unknown as Record<string, unknown>).__ZWAGGEN_BUNDLED_PROXY__ = '/proxy';
  probe();
  expect(getProxyUrl()).toBe('/proxy');
});

test('without the hint, getProxyUrl stays at default', () => {
  probe();
  expect(getProxyUrl()).toBe('http://localhost:4801');
});

test('non-string hint is ignored', () => {
  (window as unknown as Record<string, unknown>).__ZWAGGEN_BUNDLED_PROXY__ = 42;
  probe();
  expect(getProxyUrl()).toBe('http://localhost:4801');
});

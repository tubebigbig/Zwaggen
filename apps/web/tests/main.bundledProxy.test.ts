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
  const bundledProxyHint =
    typeof window !== 'undefined' &&
    typeof (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__ === 'string'
      ? (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__
      : null;
  // Hint is informational ("bundled proxy is mounted at /proxy"). The
  // actual setProxyUrl arg is the BASE URL of the proxy server — empty
  // string for same-origin so runner/send.ts produces `/proxy?url=…` (not
  // `/proxy/proxy?url=…`).
  if (bundledProxyHint) setProxyUrl('');
}

test('main.tsx-style probe reads __ZWAGGEN_BUNDLED_PROXY__ and sets proxy base to "" (same-origin)', () => {
  (window as unknown as Record<string, unknown>).__ZWAGGEN_BUNDLED_PROXY__ = '/proxy';
  probe();
  expect(getProxyUrl()).toBe('');
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

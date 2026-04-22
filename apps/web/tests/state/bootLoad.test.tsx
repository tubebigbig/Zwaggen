import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { App } from '../../src/App';
import { setStorage, resetStorage, type SpecStorage } from '../../src/storage/spec-storage';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

const minimalSpec = JSON.stringify({
  ...emptySpec(),
  info: { ...emptySpec().info, name: 'Boot Test', baseUrl: 'http://api' },
});

function setLocation(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  resetStorage();
  setLocation('');
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false, selectedEndpointId: null });
});

afterEach(() => {
  resetStorage();
  cleanup();
  vi.restoreAllMocks();
});

test('?spec=<url> fetches and replaces the spec; URL is stripped on success', async () => {
  setLocation('?spec=https://example.com/spec.json');
  globalThis.fetch = vi.fn(async () => new Response(minimalSpec, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as any;

  render(<App />);

  await waitFor(() => {
    expect(useSpecStore.getState().spec.info.name).toBe('Boot Test');
  });
  await waitFor(() => {
    expect(window.location.search).toBe('');
  });
});

test('?specPath=<path> delegates to storage.openByPath', async () => {
  setLocation('?specPath=/users/me/spec.zwag');
  const custom: SpecStorage = {
    loadDraft: async () => null,
    saveDraft: async () => {},
    clearDraft: async () => {},
    supportsNativePicker: () => false,
    pickOpen: async () => null,
    pickSave: async () => null,
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => {},
    listRecent: async () => [],
    recordRecent: async () => {},
    openByPath: async (path) => ({ handle: path, name: 'spec.zwag', text: minimalSpec }),
  };
  setStorage(custom);

  render(<App />);

  await waitFor(() => {
    expect(useSpecStore.getState().spec.info.name).toBe('Boot Test');
  });
  await waitFor(() => {
    expect(window.location.search).toBe('');
  });
});

test('?spec=<url> fetch failure renders the LoadErrorModal', async () => {
  setLocation('?spec=https://example.com/missing.json');
  globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' })) as any;

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
  });
});

test('no URL param falls through to restoreDraft', async () => {
  setLocation('');
  // Default storage's loadDraft returns null in jsdom (idb-keyval has no draft) — App proceeds with the empty spec.
  render(<App />);
  // No fetch and no openByPath called — assert the spec stays empty.
  expect(useSpecStore.getState().spec.info.name).toBe(emptySpec().info.name);
});

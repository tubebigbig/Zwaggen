import { afterEach, expect, test, vi } from 'vitest';
import { configureFromBridge } from '../src/bootstrap';
import { getStorage, resetStorage } from '../src/storage/spec-storage';
import { getTransport, resetTransport, fetchTransport } from '@zwaggen/core';
import type { ZwaggenBridge } from '../src/types/zwaggen-bridge';

afterEach(() => {
  resetStorage();
  resetTransport();
  vi.restoreAllMocks();
});

test('configureFromBridge swaps the transport singleton', async () => {
  const sent: any[] = [];
  const bridge: ZwaggenBridge = {
    sendHttpRequest: async (req) => {
      sent.push(req);
      return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' };
    },
    pickOpen: async () => null,
    pickSave: async () => null,
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => {},
    openByPath: async () => null,
  };
  configureFromBridge(bridge);
  const t = getTransport();
  expect(t).not.toBe(fetchTransport);
  await t({ method: 'GET', url: 'http://x', headers: {} });
  expect(sent).toHaveLength(1);
});

test('configureFromBridge swaps the storage file-I/O methods but keeps drafts on browser default', async () => {
  const bridge: ZwaggenBridge = {
    sendHttpRequest: async () => ({ ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }),
    pickOpen: async () => ({ handle: '/x.zwag', name: 'x.zwag', text: '{}' }),
    pickSave: async () => '/y.zwag',
    readFile: async (h) => ({ text: 'r', name: String(h) }),
    writeFile: async () => {},
    openByPath: async (p) => ({ handle: p, name: p, text: 'o' }),
  };
  configureFromBridge(bridge);
  const s = getStorage();
  expect(s.supportsNativePicker()).toBe(true);
  expect(await s.pickOpen()).toEqual({ handle: '/x.zwag', name: 'x.zwag', text: '{}' });
  expect(await s.openByPath('/z')).toEqual({ handle: '/z', name: '/z', text: 'o' });
  // loadDraft is NOT overridden — comes from browser default (IDB-backed, returns null in test env)
  expect(typeof s.loadDraft).toBe('function');
});

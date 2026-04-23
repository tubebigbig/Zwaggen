import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { configureFromBridge } from '../src/bootstrap';
import { getStorage, resetStorage } from '../src/storage/spec-storage';
import { getTransport, resetTransport, fetchTransport, emptySpec } from '@zwaggen/core';
import { useSpecStore } from '../src/state/store';
import type { ZwaggenBridge } from '../src/types/zwaggen-bridge';

afterEach(() => {
  resetStorage();
  resetTransport();
  // Reset the spec store so cross-test pollution doesn't leak into the
  // onOpenFile assertion below (useSpecStore is module-level state).
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false, selectedEndpointId: null });
  vi.restoreAllMocks();
});

function emptyBridge(overrides: Partial<ZwaggenBridge> = {}): ZwaggenBridge {
  return {
    sendHttpRequest: async () => ({ ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }),
    pickOpen: async () => null,
    pickSave: async () => null,
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => {},
    openByPath: async () => null,
    recentsList: async () => [],
    recentsRecord: async () => {},
    onOpenFile: () => () => {},
    ...overrides,
  };
}

test('configureFromBridge swaps the transport singleton', async () => {
  const sent: any[] = [];
  const bridge = emptyBridge({
    sendHttpRequest: async (req) => {
      sent.push(req);
      return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' };
    },
  });
  configureFromBridge(bridge);
  const t = getTransport();
  expect(t).not.toBe(fetchTransport);
  await t({ method: 'GET', url: 'http://x', headers: {} });
  expect(sent).toHaveLength(1);
});

test('configureFromBridge swaps the storage file-I/O methods but keeps drafts on browser default', async () => {
  const bridge = emptyBridge({
    pickOpen: async () => ({ handle: '/x.zwag', name: 'x.zwag', text: '{}' }),
    pickSave: async () => '/y.zwag',
    readFile: async (h) => ({ text: 'r', name: String(h) }),
    writeFile: async () => {},
    openByPath: async (p) => ({ handle: p, name: p, text: 'o' }),
  });
  configureFromBridge(bridge);
  const s = getStorage();
  expect(s.supportsNativePicker()).toBe(true);
  expect(await s.pickOpen()).toEqual({ handle: '/x.zwag', name: 'x.zwag', text: '{}' });
  expect(await s.openByPath('/z')).toEqual({ handle: '/z', name: '/z', text: 'o' });
  // loadDraft is NOT overridden — comes from browser default (IDB-backed, returns null in test env)
  expect(typeof s.loadDraft).toBe('function');
});

test('configureFromBridge routes recents through the bridge', async () => {
  const recordCalls: string[] = [];
  const bridge = emptyBridge({
    recentsList: async () => [{ path: '/x.zwag', openedAt: 5 }],
    recentsRecord: async (p) => { recordCalls.push(p); },
  });
  configureFromBridge(bridge);
  const s = getStorage();
  expect(await s.listRecent()).toEqual([{ name: 'x.zwag', openedAt: 5, handle: '/x.zwag' }]);
  await s.recordRecent({ name: 'whatever', handle: '/y.zwag' });
  expect(recordCalls).toEqual(['/y.zwag']);
});

test('configureFromBridge subscribes to onOpenFile and replaceSpec routes through it', async () => {
  let registered: ((p: { path: string }) => void) | null = null;
  const bridge = emptyBridge({
    openByPath: async (p) => ({
      handle: p,
      name: p,
      text: JSON.stringify({
        schemaVersion: 4,
        info: { name: 'X' },
        auth: { type: 'none' },
        useProxyDefault: false,
        environments: { default: { variables: [] } },
        activeEnvironment: 'default',
        types: {},
        endpoints: [],
      }),
    }),
    onOpenFile: (cb) => { registered = cb; return () => {}; },
  });
  configureFromBridge(bridge);
  expect(typeof registered).toBe('function');
  // Drive the open-file event the way the IPC layer would
  await registered!({ path: '/z.zwag' });
  // Allow the async pipeline to settle
  await new Promise((r) => setTimeout(r, 0));
  // The store should now hold the spec we returned from openByPath
  expect(useSpecStore.getState().spec.info.name).toBe('X');
});

import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';

function makeEndpoint(overrides: Partial<Spec['endpoints'][number]> = {}): Spec['endpoints'][number] {
  return {
    id: 'e1',
    method: 'GET',
    path: '/test',
    pathParams: [],
    requestBody: null,
    responses: [],
    auth: 'inherit',
    useProxy: 'inherit',
    ...overrides,
  };
}

function makeSpec(endpoint: Spec['endpoints'][number]): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.endpoints = [endpoint];
  return s;
}

async function setup(endpoint: Spec['endpoints'][number], specOverrides: Partial<Spec> = {}) {
  const spec = { ...makeSpec(endpoint), ...specOverrides };
  await useSpecStore.getState().replaceSpec(spec, null);
  useSpecStore.getState().selectEndpoint('e1');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('cors-or-network error with useProxy off renders Retry through proxy button', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await setup(makeEndpoint({ useProxy: false }));
  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
  expect(await screen.findByRole('button', { name: /retry through proxy/i })).toBeInTheDocument();
});

it('clicking Retry through proxy re-fires the request with useProxy true', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  vi.stubGlobal('fetch', fetchMock);
  await setup(makeEndpoint({ useProxy: false }));
  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
  const retry = await screen.findByRole('button', { name: /retry through proxy/i });
  await userEvent.click(retry);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  // Second call should hit the proxy URL pattern (runner formats as
  // `<proxyBase>/proxy?url=<encoded target>`).
  const secondCall = fetchMock.mock.calls[1]?.[0] as string | URL;
  expect(String(secondCall)).toMatch(/\/proxy\?url=/);
});

it('cors-or-network error with useProxy already on does NOT render the retry button', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await setup(makeEndpoint({ useProxy: true }));
  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /retry through proxy/i })).toBeNull();
});

it('timeout error does NOT render the retry button', async () => {
  // AbortError → kind: 'timeout'
  const abortErr = new Error('aborted');
  abortErr.name = 'AbortError';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr));
  await setup(makeEndpoint({ useProxy: false }));
  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /retry through proxy/i })).toBeNull();
});

it('IS_PLAYGROUND mode hides the retry button', async () => {
  // IS_PLAYGROUND is a module-load constant — re-mock the config module
  // and re-import RunPanel so the new value takes effect. The store is
  // also re-evaluated by resetModules, so we need to re-import it and
  // seed it via the freshly-loaded module instance (not the top-level
  // one this file imported, which now points to a stale module copy).
  vi.resetModules();
  vi.doMock('../../src/config', () => ({ IS_PLAYGROUND: true }));
  const { RunPanel: PlaygroundRunPanel } = await import('../../src/ui/RunPanel');
  const { useSpecStore: freshStore } = await import('../../src/state/store');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  const spec = makeSpec(makeEndpoint({ useProxy: false }));
  await freshStore.getState().replaceSpec(spec, null);
  freshStore.getState().selectEndpoint('e1');
  render(<PlaygroundRunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /retry through proxy/i })).toBeNull();
  vi.doUnmock('../../src/config');
});

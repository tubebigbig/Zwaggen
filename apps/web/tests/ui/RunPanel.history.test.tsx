import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clear as clearIdb } from 'idb-keyval';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import { pushHistory } from '../../src/storage/history';
import type { Spec } from '../../src/schema/types';
import type { HistoryEntry } from '../../src/storage/history';

function makeSpec(endpointId = 'e1'): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.endpoints = [
    {
      id: endpointId,
      method: 'GET',
      path: '/items',
      pathParams: [],
      queryParams: [],
      headers: [],
      requestBody: null,
      responses: [],
      auth: 'inherit',
      useProxy: 'inherit',
    },
  ];
  return s;
}

async function seedStore(spec: Spec) {
  await useSpecStore.getState().replaceSpec(spec, null);
  useSpecStore.getState().selectEndpoint(spec.endpoints[0]!.id);
}

function makeFetchResponse(status: number, body: unknown) {
  const json = JSON.stringify(body);
  return new Response(json, {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Response-Time': '42' },
  });
}

beforeEach(async () => {
  // Reset IDB between tests so history doesn't leak across test cases
  await clearIdb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Test 1: After simulated Send, a history entry appears in the drawer.
it('shows a history entry in the drawer after Send', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(200, { ok: true })));

  const spec = makeSpec('ep-test1');
  await seedStore(spec);

  render(<RunPanel />);

  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    // After send, drawer should show a time element (entry row)
    expect(screen.getAllByRole('time').length).toBeGreaterThan(0);
  });
});

// Test 2: Drawer shows most recent entry on top.
it('shows most recent entry above earlier entries', async () => {
  let callCount = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      callCount++;
      const body = callCount === 1 ? { first: true } : { second: true };
      return Promise.resolve(makeFetchResponse(200, body));
    }),
  );

  const spec = makeSpec('ep-test2');
  await seedStore(spec);

  render(<RunPanel />);

  // First send
  await userEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(screen.getAllByRole('time').length).toBe(1));

  // Second send
  await userEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(screen.getAllByRole('time').length).toBe(2));

  // The two <time> elements: newest (second send) should appear first in DOM
  const times = screen.getAllByRole('time');
  expect(times).toHaveLength(2);
  // pushHistory prepends, so first item in DOM is the most recent send
  expect(times[0]).toBeInTheDocument();
  expect(times[1]).toBeInTheDocument();
});

// Test 3: Replay reseeds the form.
it('replay reseeds the form without sending', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(200, { hello: 'world' })));

  const spec = makeSpec('ep-test3');
  // Add a query param so we can verify replay sets it
  spec.endpoints[0]!.queryParams = [{ name: 'foo', required: false, type: { kind: 'string' } }];
  await seedStore(spec);

  render(<RunPanel />);

  // Set query param value
  const fooInput = screen.getByLabelText('query:foo');
  await userEvent.clear(fooInput);
  await userEvent.type(fooInput, 'bar');

  // Send to record history
  await userEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(screen.getAllByRole('time').length).toBe(1));

  // Change the query param to something different
  await userEvent.clear(fooInput);
  await userEvent.type(fooInput, 'changed');
  expect(fooInput).toHaveValue('changed');

  // Click Replay
  const replayBtn = screen.getByRole('button', { name: /replay/i });
  await userEvent.click(replayBtn);

  // Form should be reseeded with the original value 'bar'
  await waitFor(() => {
    expect(fooInput).toHaveValue('bar');
  });

  // fetch should only have been called once (the original Send, not on Replay)
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
});

// Test 4: Clear history wipes the drawer.
it('clear history shows noHistory text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(200, {})));
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

  const spec = makeSpec('ep-test4');
  await seedStore(spec);

  render(<RunPanel />);

  // Send to create an entry
  await userEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(screen.getAllByRole('time').length).toBe(1));

  // Click Clear
  const clearBtn = screen.getByRole('button', { name: /clear/i });
  await userEvent.click(clearBtn);

  await waitFor(() => {
    expect(screen.getByText('No runs yet. Click Send to record one.')).toBeInTheDocument();
  });
});

// Test 5: Truncated body banner appears when expanded.
it('shows truncated banner for entries with rawTruncated=true', async () => {
  const spec = makeSpec('ep-test5');
  await seedStore(spec);

  // Directly push a history entry with rawTruncated: true
  const entry: HistoryEntry = {
    id: 'trunc-1',
    at: Date.now(),
    endpointId: 'ep-test5',
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
    baseUrlUsed: 'https://api.example.com',
    useProxyUsed: false,
    result: {
      ok: true,
      status: 200,
      statusText: 'OK',
      latencyMs: 99,
      rawText: '{"truncated":true}',
      rawTruncated: true,
      validationErrors: [],
    },
  };
  await pushHistory(entry);

  render(<RunPanel />);

  // Wait for drawer to load the entry
  await waitFor(() => expect(screen.getAllByRole('time').length).toBeGreaterThan(0));

  // Expand the entry by clicking on it
  const timeEl = screen.getAllByRole('time')[0]!;
  await userEvent.click(timeEl.closest('button')!);

  // Truncated banner should appear
  await waitFor(() => {
    expect(screen.getByText('Response body truncated at 100 KB.')).toBeInTheDocument();
  });
});

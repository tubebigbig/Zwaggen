import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clear as clearIdb } from 'idb-keyval';
import { vi } from 'vitest';
import * as batchModule from '../../src/runner/batch';
import { BatchRunPanel } from '../../src/ui/BatchRunPanel';
import { emptySpec } from '../../src/schema/defaults';
import { pushHistory } from '../../src/storage/history';
import type { Spec } from '../../src/schema/types';
import type { HistoryEntry } from '../../src/storage/history';

function makeSpec(endpointIds: string[] = ['e1', 'e2']): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.endpoints = endpointIds.map((id, i) => ({
    id,
    method: 'GET' as const,
    path: `/items/${i + 1}`,
    pathParams: [],
    queryParams: [],
    headers: [],
    requestBody: null,
    responses: [],
    auth: 'inherit' as const,
    useProxy: 'inherit' as const,
  }));
  return s;
}

function makeHistoryEntry(endpointId: string, status = 200): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    at: Date.now(),
    endpointId,
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
    baseUrlUsed: 'https://api.example.com',
    useProxyUsed: false,
    result: {
      ok: true,
      status,
      statusText: 'OK',
      latencyMs: 42,
      rawText: '{"ok":true}',
      validationErrors: [],
    },
  };
}

function makeFetchResponse(status: number, body: unknown) {
  const json = JSON.stringify(body);
  return new Response(json, {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Response-Time': '42' },
  });
}

beforeEach(async () => {
  await clearIdb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Test 1: Panel with 2 endpoints renders 2 rows.
it('renders a row for each endpoint', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(makeFetchResponse(200, { ok: true }))
  ));

  const spec = makeSpec(['ep1a', 'ep1b']);
  await pushHistory(makeHistoryEntry('ep1a'));
  await pushHistory(makeHistoryEntry('ep1b'));

  render(<BatchRunPanel spec={spec} onClose={vi.fn()} />);

  // Wait for runs to complete or at least rows to appear
  await waitFor(() => {
    const rows = screen.getAllByRole('row');
    // 1 header row + 2 data rows
    expect(rows.length).toBe(3);
  });
});

// Test 2: Row status updates to done after completion.
it('shows 200 status after runs complete', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(makeFetchResponse(200, { ok: true }))
  ));

  const spec = makeSpec(['ep2a', 'ep2b']);
  await pushHistory(makeHistoryEntry('ep2a'));
  await pushHistory(makeHistoryEntry('ep2b'));

  render(<BatchRunPanel spec={spec} onClose={vi.fn()} />);

  await waitFor(() => {
    // Both rows should show "200" in the status column (statusText may be empty in jsdom).
    // Longer timeout than default: CI runners need time to settle two async fetch+state cycles.
    const cells = screen.getAllByText(/^200/);
    expect(cells.length).toBe(2);
  }, { timeout: 5000 });
});

// Test 3: Stop button triggers cancel.
it('calls cancel when Stop button is clicked', async () => {
  const cancelSpy = vi.fn();
  const neverResolve = new Promise<void>(() => {});

  vi.spyOn(batchModule, 'runAll').mockReturnValue({ cancel: cancelSpy, done: neverResolve });

  const spec = makeSpec(['ep3a', 'ep3b', 'ep3c']);

  render(<BatchRunPanel spec={spec} onClose={vi.fn()} />);

  // Panel starts in running state (spy returns neverResolve)
  const stopBtn = await screen.findByRole('button', { name: /stop/i });
  await userEvent.click(stopBtn);

  expect(cancelSpy).toHaveBeenCalled();
});

// Test 4: Summary count updates.
it('shows passed/total summary after all rows resolve', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(makeFetchResponse(200, { ok: true }))
  ));

  const spec = makeSpec(['ep4a', 'ep4b']);
  await pushHistory(makeHistoryEntry('ep4a'));
  await pushHistory(makeHistoryEntry('ep4b'));

  render(<BatchRunPanel spec={spec} onClose={vi.fn()} />);

  await waitFor(() => {
    // Summary format: "2/2 passed"
    expect(screen.getByText(/2\/2 passed/i)).toBeInTheDocument();
  });
});

// Test 5: Close button calls onClose.
it('calls onClose when close button is clicked', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(makeFetchResponse(200, { ok: true }))
  ));

  const onClose = vi.fn();
  const spec = makeSpec(['ep5a']);

  render(<BatchRunPanel spec={spec} onClose={onClose} />);

  const closeBtn = screen.getByRole('button', { name: /dismiss/i });
  await userEvent.click(closeBtn);

  expect(onClose).toHaveBeenCalledOnce();
});

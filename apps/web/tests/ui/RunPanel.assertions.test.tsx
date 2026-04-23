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

async function setup(endpoint: Spec['endpoints'][number]) {
  const spec = makeSpec(endpoint);
  await useSpecStore.getState().replaceSpec(spec, null);
  useSpecStore.getState().selectEndpoint('e1');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Case 1: All pass — 200 status, low latency, correct header
it('renders three green chips when all assertions pass', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );

  await setup(
    makeEndpoint({
      assertions: {
        expectedStatus: 200,
        maxLatencyMs: 100000, // very generous so real latency passes
        requiredHeaders: [{ name: 'content-type', value: 'application/json' }],
      },
    }),
  );

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.getByTitle('Status 200')).toBeInTheDocument();
  });

  const statusChip = screen.getByTitle('Status 200');
  expect(statusChip).toHaveClass('bg-emerald-100');

  const headerChip = screen.getByTitle('content-type: application/json');
  expect(headerChip).toHaveClass('bg-emerald-100');

  // latency chip should be green (passed)
  const latencyChip = screen.getByTitle(/≤ 100000ms/);
  expect(latencyChip).toHaveClass('bg-emerald-100');
});

// Case 2: Status fail — fetch returns 404 but expectedStatus=200
it('renders a red chip with "Expected 200, got 404" when status fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );

  await setup(
    makeEndpoint({
      assertions: {
        expectedStatus: 200,
      },
    }),
  );

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.getByTitle('Expected 200, got 404')).toBeInTheDocument();
  });

  const chip = screen.getByTitle('Expected 200, got 404');
  expect(chip).toHaveClass('bg-red-100');
});

// Case 3: Latency fail — use maxLatencyMs: -1 so even 0ms latency fails
it('renders a red chip when latency exceeds maxLatencyMs', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );

  await setup(
    makeEndpoint({
      assertions: {
        maxLatencyMs: -1, // impossible to satisfy; any latency >= 0ms will fail
      },
    }),
  );

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    // chip title matches "Too slow: Xms > -1ms"
    expect(screen.getByTitle(/Too slow:/)).toBeInTheDocument();
  });

  const chip = screen.getByTitle(/Too slow:/);
  expect(chip).toHaveClass('bg-red-100');
});

// Case 4: Header missing — response lacks required x-request-id header
it('renders a red chip with "Missing x-request-id" when required header is absent', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        // no x-request-id header
      }),
    ),
  );

  await setup(
    makeEndpoint({
      assertions: {
        requiredHeaders: [{ name: 'x-request-id', value: 'abc123' }],
      },
    }),
  );

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.getByTitle('Missing x-request-id')).toBeInTheDocument();
  });

  const chip = screen.getByTitle('Missing x-request-id');
  expect(chip).toHaveClass('bg-red-100');
});

// Case 5: No assertions — no chips rendered
it('renders no assertion chips when endpoint has no assertions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );

  await setup(makeEndpoint()); // no assertions field

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  // Wait for result to appear (the type-validation chip is always shown)
  await waitFor(() => {
    expect(screen.getByText('no type declared')).toBeInTheDocument();
  });

  // No assertion chips should have appeared (they render with title attributes)
  expect(screen.queryByTitle(/Status/)).toBeNull();
  expect(screen.queryByTitle(/Too slow/)).toBeNull();
  expect(screen.queryByTitle(/Missing/)).toBeNull();
});

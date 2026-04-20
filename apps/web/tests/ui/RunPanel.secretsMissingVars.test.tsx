import 'fake-indexeddb/auto';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';
import { saveSecrets } from '../../src/storage/drafts';

function makeSpec(): Spec {
  const s = emptySpec();
  // Use {{TOKEN}} in the baseUrl so collectMissingVars sees it
  s.info.baseUrl = 'https://{{TOKEN}}.example.com/x';
  s.endpoints = [
    {
      id: 'e1',
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
  useSpecStore.getState().selectEndpoint('e1');
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

beforeEach(async () => {
  // Reset IDB secrets so tests don't bleed into each other
  await saveSecrets({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Case 1: Secret filled via IDB only (value stripped from in-memory env)
// The snapshot loaded on mount should detect TOKEN in IDB → no confirm dialog.
it('does not show confirm when secret is filled via IDB only', async () => {
  stubFetch();

  const spec = makeSpec();
  spec.environments['default'] = {
    variables: [{ name: 'TOKEN', value: '', secret: true }],
  };
  // Seed IDB before render so the mount effect picks it up
  await saveSecrets({ default: { TOKEN: 'abc123' } });
  await seedStore(spec);

  const confirmMock = vi.fn().mockReturnValue(false);
  vi.stubGlobal('confirm', confirmMock);

  render(<RunPanel />);

  // Wait for the snapshot effect to load from IDB (it's async on mount)
  // We use a small act + flushPromises pattern: wait until the component
  // has settled after the async effect Promise resolves.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  // Wait for send to complete (button re-enables after onSend finishes)
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /sending/i })).toBeNull();
  });

  expect(confirmMock).not.toHaveBeenCalled();
});

// Case 2: Secret truly missing — no inline value, no IDB entry → confirm MUST fire
it('shows confirm with TOKEN in the message when secret is missing', async () => {
  stubFetch();

  const spec = makeSpec();
  spec.environments['default'] = {
    variables: [{ name: 'TOKEN', value: '', secret: true }],
  };
  // Do NOT save anything to IDB (beforeEach cleared it already)
  await seedStore(spec);

  const confirmMock = vi.fn().mockReturnValue(false);
  vi.stubGlobal('confirm', confirmMock);

  render(<RunPanel />);

  // Let the mount effect settle (IDB is empty so snapshot stays {})
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(confirmMock).toHaveBeenCalled();
  });

  const msg: string = confirmMock.mock.calls[0]![0] as string;
  expect(msg).toContain('TOKEN');
});

// Case 3: Secret filled inline (non-empty v.value) → no confirm dialog
it('does not show confirm when secret has an inline value', async () => {
  stubFetch();

  const spec = makeSpec();
  spec.environments['default'] = {
    variables: [{ name: 'TOKEN', value: 'inline', secret: true }],
  };
  await seedStore(spec);

  const confirmMock = vi.fn().mockReturnValue(false);
  vi.stubGlobal('confirm', confirmMock);

  render(<RunPanel />);

  // Let effects settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /sending/i })).toBeNull();
  });

  expect(confirmMock).not.toHaveBeenCalled();
});

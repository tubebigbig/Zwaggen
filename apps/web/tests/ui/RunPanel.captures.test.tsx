import 'fake-indexeddb/auto';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';
import { loadSecrets, saveSecrets } from '../../src/storage/drafts';

function makeSpec(overrides?: Partial<Spec['endpoints'][number]>): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.endpoints = [
    {
      id: 'e1',
      method: 'GET',
      path: '/test',
      pathParams: [],
      
      
      requestBody: null,
      responses: [],
      auth: 'inherit',
      useProxy: 'inherit',
      ...overrides,
    },
  ];
  return s;
}

async function setup(spec: Spec) {
  await useSpecStore.getState().replaceSpec(spec, null);
  useSpecStore.getState().selectEndpoint('e1');
  // Let IDB effects settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function stubFetch200(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function stubFetch500() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'server error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

beforeEach(async () => {
  await saveSecrets({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Case 1: Non-secret capture hits — env var value is updated in spec, green row shown.
it('non-secret capture: updates spec variable value and renders green row', async () => {
  const spec = makeSpec({
    captures: [{ path: 'token', setVar: 'authToken' }],
  });
  spec.environments['default'] = {
    variables: [{ name: 'authToken', value: '', secret: false }],
  };
  stubFetch200({ token: 'abc' });
  await setup(spec);

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  // Wait for capture row to appear (green span containing "authToken ←")
  await waitFor(() => {
    expect(screen.getByText(/authToken ←/)).toBeInTheDocument();
  });

  // Spec should be updated
  await waitFor(() => {
    const env = useSpecStore.getState().spec.environments['default'];
    const v = env?.variables.find((v) => v.name === 'authToken');
    expect(v?.value).toBe('abc');
  });
});

// Case 2: Secret capture hits — IDB updated, spec value stays empty, green row shown.
it('secret capture: updates IDB secrets and renders green row', async () => {
  // Pre-seed IDB with a placeholder so the missing-secrets check doesn't abort onSend
  await saveSecrets({ default: { authToken: 'old' } });

  const spec = makeSpec({
    captures: [{ path: 'token', setVar: 'authToken' }],
  });
  spec.environments['default'] = {
    variables: [{ name: 'authToken', value: '', secret: true }],
  };
  stubFetch200({ token: 'abc' });
  await setup(spec);

  render(<RunPanel />);

  // Allow the IDB secrets effect to load
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  // Wait for capture row (green span)
  await waitFor(() => {
    expect(screen.getByText(/authToken ←/)).toBeInTheDocument();
  });

  // IDB secrets should have been updated to the new value
  await waitFor(async () => {
    const secrets = await loadSecrets();
    expect(secrets['default']?.['authToken']).toBe('abc');
  });

  // Spec value should stay empty (secret is in IDB, not spec)
  const env = useSpecStore.getState().spec.environments['default'];
  const v = env?.variables.find((v) => v.name === 'authToken');
  expect(v?.value).toBe('');
});

// Case 3: Missing env var — warning row rendered (amber).
it('missing env var: renders amber warning row', async () => {
  const spec = makeSpec({
    captures: [{ path: 'token', setVar: 'doesNotExist' }],
  });
  // default env has no variable named doesNotExist
  spec.environments['default'] = { variables: [] };
  stubFetch200({ token: 'abc' });
  await setup(spec);

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.getByText(/doesNotExist/)).toBeInTheDocument();
  });

  // Should include a warning about env var not defined
  await waitFor(() => {
    expect(screen.getByText(/not defined/)).toBeInTheDocument();
  });
});

// Case 4: Path not found — warning row with "path not found".
it('path not found: renders amber warning with path not found', async () => {
  const spec = makeSpec({
    captures: [{ path: 'nonexistent', setVar: 'authToken' }],
  });
  spec.environments['default'] = {
    variables: [{ name: 'authToken', value: '', secret: false }],
  };
  stubFetch200({ token: 'abc' }); // body doesn't have 'nonexistent'
  await setup(spec);

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.getByText(/authToken/)).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(screen.getByText(/path not found|not found/i)).toBeInTheDocument();
  });
});

// Case 5: Non-2xx response — captures skipped, no capture UI rendered.
it('non-2xx response: skips captures, renders no capture row', async () => {
  const spec = makeSpec({
    captures: [{ path: 'token', setVar: 'authToken' }],
  });
  spec.environments['default'] = {
    variables: [{ name: 'authToken', value: 'original', secret: false }],
  };
  stubFetch500();
  await setup(spec);

  render(<RunPanel />);
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  // Wait for result panel to appear
  await waitFor(() => {
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  // No capture row should be rendered
  expect(screen.queryByText(/authToken ←/)).toBeNull();

  // Spec variable should be unchanged
  const env = useSpecStore.getState().spec.environments['default'];
  const v = env?.variables.find((v) => v.name === 'authToken');
  expect(v?.value).toBe('original');
});

import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';
import { saveSecrets } from '../../src/storage/drafts';

function makeSpec(): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'http://api';
  s.types = {
    Filter: {
      kind: 'object',
      example: { status: 'active', category: 'widgets' },
      fields: [
        { name: 'status', required: true, type: { kind: 'string' } },
        { name: 'category', required: false, type: { kind: 'string' } },
      ],
    },
  };
  s.endpoints = [
    {
      id: 'list',
      method: 'GET',
      path: '/items',
      tags: ['default'],
      pathParams: [],
      queryParams: [{ name: 'filter', required: true, type: { kind: 'ref', ref: 'Filter' } }],
      headers: [],
      requestBody: null,
      responses: [],
      auth: 'inherit',
      useProxy: 'inherit',
    },
  ];
  return s;
}

async function setup(spec: Spec) {
  await useSpecStore.getState().replaceSpec(spec, null);
  useSpecStore.getState().selectEndpoint('list');
  // Let IDB effects settle so subsequent assertions don't race the seed.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  await saveSecrets({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('object-typed query param renders one row per field, pre-populated from example', async () => {
  await setup(makeSpec());
  render(<RunPanel />);

  // Filter ref was the parent param — its name should NOT appear as a row.
  expect(screen.queryByLabelText('query:filter')).toBeNull();

  // Each field of the resolved object becomes its own row.
  const statusInput = screen.getByLabelText('query:status') as HTMLInputElement;
  const categoryInput = screen.getByLabelText('query:category') as HTMLInputElement;

  // Pre-populated from the type's `example`.
  await waitFor(() => {
    expect(statusInput.value).toBe('active');
    expect(categoryInput.value).toBe('widgets');
  });
});

it('object-typed query param produces multi-key URL on Run', async () => {
  const fetchSpy = vi.fn().mockResolvedValue(
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchSpy);

  await setup(makeSpec());
  render(<RunPanel />);

  const statusInput = screen.getByLabelText('query:status') as HTMLInputElement;
  await waitFor(() => expect(statusInput.value).toBe('active'));

  await userEvent.click(screen.getByRole('button', { name: /^send$/i }));

  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

  const urlArg = fetchSpy.mock.calls[0]![0] as string;
  expect(urlArg).toContain('status=active');
  expect(urlArg).toContain('category=widgets');
  expect(urlArg).not.toContain('filter=');
});

import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Endpoint, type Spec } from '@zwaggen/core';

function seed(spec: Spec) {
  useSpecStore.setState({
    spec,
    fileHandle: null,
    dirty: false,
    selectedEndpointId: spec.endpoints[0]!.id,
  });
}

function mkEndpoint(over: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'e1',
    method: 'GET',
    path: '/x',
    pathParams: [],
    requestBody: null,
    responses: [],
    auth: 'inherit',
    useProxy: 'inherit',
    ...over,
  };
}

test('queryParams mode select displays "Inline" when slot is undefined (Add button stays visible)', () => {
  seed({ ...emptySpec(), endpoints: [mkEndpoint()] });
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Query params mode') as HTMLSelectElement;
  expect(select.value).toBe('inline');
});

test('switching to Inline fields explicitly seeds an empty inline ObjectType in the spec', async () => {
  seed({ ...emptySpec(), endpoints: [mkEndpoint()] });
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Query params mode') as HTMLSelectElement;
  // The dropdown already shows 'inline' (because value is undefined), but the underlying
  // queryParams stays undefined until the user actually adds a field. Picking 'inline'
  // explicitly seeds the empty object so consumers can observe the transition.
  await userEvent.selectOptions(select, 'inline');
  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.queryParams).toEqual({ kind: 'object', fields: [] });
  });
});

test('switching to Use shared type with no named object types is disabled', () => {
  seed({ ...emptySpec(), endpoints: [mkEndpoint()] });
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Query params mode') as HTMLSelectElement;
  const refOpt = Array.from(select.options).find((o) => o.value === 'ref')!;
  expect(refOpt.disabled).toBe(true);
});

test('switching Inline → Use shared type picks the first named object type', async () => {
  const spec: Spec = {
    ...emptySpec(),
    types: {
      Pagination: {
        kind: 'object',
        fields: [{ name: 'page', required: true, type: { kind: 'integer' } }],
      },
    },
    endpoints: [mkEndpoint({
      queryParams: {
        kind: 'object',
        fields: [{ name: 'q', required: false, type: { kind: 'string' } }],
      },
    })],
  };
  seed(spec);
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Query params mode') as HTMLSelectElement;
  await userEvent.selectOptions(select, 'ref');
  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.queryParams).toEqual({ kind: 'ref', ref: 'Pagination' });
  });
});

test('switching Use shared type → Inline copies the ref\'d type\'s fields', async () => {
  const spec: Spec = {
    ...emptySpec(),
    types: {
      Pagination: {
        kind: 'object',
        fields: [
          { name: 'page', required: true, type: { kind: 'integer' } },
          { name: 'limit', required: false, type: { kind: 'integer' } },
        ],
      },
    },
    endpoints: [mkEndpoint({ queryParams: { kind: 'ref', ref: 'Pagination' } })],
  };
  seed(spec);
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Query params mode') as HTMLSelectElement;
  await userEvent.selectOptions(select, 'inline');
  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.queryParams).toEqual({
      kind: 'object',
      fields: [
        { name: 'page', required: true, type: { kind: 'integer' } },
        { name: 'limit', required: false, type: { kind: 'integer' } },
      ],
    });
  });
});

test('switching any → None drops the slot', async () => {
  const spec: Spec = {
    ...emptySpec(),
    endpoints: [mkEndpoint({
      queryParams: {
        kind: 'object',
        fields: [{ name: 'q', required: false, type: { kind: 'string' } }],
      },
    })],
  };
  seed(spec);
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Query params mode') as HTMLSelectElement;
  await userEvent.selectOptions(select, 'none');
  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.queryParams).toBeUndefined();
  });
});

test('headers section uses the same toggle pattern (Inline default for undefined slot)', () => {
  seed({ ...emptySpec(), endpoints: [mkEndpoint()] });
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Headers mode') as HTMLSelectElement;
  expect(select.value).toBe('inline');
  const refOpt = Array.from(select.options).find((o) => o.value === 'ref')!;
  expect(refOpt.disabled).toBe(true);
});

test('Add param appears immediately when slot is undefined; first click transitions to inline ObjectType', async () => {
  seed({ ...emptySpec(), endpoints: [mkEndpoint()] });
  render(<EndpointEditor />);
  // The Add button is in the Query section's InlineFieldsEditor (rendered because mode is 'inline' even when value is undefined)
  const addButtons = screen.getAllByRole('button', { name: /add param/i });
  expect(addButtons.length).toBeGreaterThanOrEqual(2); // pathParams + query + headers each have one
  // Clicking the second Add (query section, after pathParams) transitions queryParams from undefined → ObjectType with one row.
  await userEvent.click(addButtons[1]!);
  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.queryParams).toEqual({ kind: 'object', fields: [{ name: '', required: true, type: { kind: 'string' } }] });
  });
});

test('Save as shared type extracts inline fields into spec.types and switches to ref mode', async () => {
  seed({
    ...emptySpec(),
    endpoints: [mkEndpoint({
      queryParams: { kind: 'object', fields: [
        { name: 'page', required: true, type: { kind: 'integer' } },
        { name: 'limit', required: false, type: { kind: 'integer' } },
      ] },
    })],
  });
  // Stub window.prompt to return our chosen type name.
  const originalPrompt = window.prompt;
  window.prompt = () => 'PaginationQuery';
  try {
    render(<EndpointEditor />);
    const promote = screen.getAllByRole('button', { name: /save as shared type/i })[0]!;
    await userEvent.click(promote);
    await waitFor(() => {
      const s = useSpecStore.getState().spec;
      expect(s.types['PaginationQuery']).toEqual({
        kind: 'object',
        fields: [
          { name: 'page', required: true, type: { kind: 'integer' } },
          { name: 'limit', required: false, type: { kind: 'integer' } },
        ],
      });
      expect(s.endpoints[0]!.queryParams).toEqual({ kind: 'ref', ref: 'PaginationQuery' });
    });
  } finally {
    window.prompt = originalPrompt;
  }
});

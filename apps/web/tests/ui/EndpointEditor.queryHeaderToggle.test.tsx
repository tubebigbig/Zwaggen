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

test('queryParams mode select defaults to "None" when slot is undefined', () => {
  seed({ ...emptySpec(), endpoints: [mkEndpoint()] });
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Query params mode') as HTMLSelectElement;
  expect(select.value).toBe('none');
});

test('switching None → Inline fields seeds the slot with an empty inline ObjectType', async () => {
  seed({ ...emptySpec(), endpoints: [mkEndpoint()] });
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Query params mode') as HTMLSelectElement;
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

test('headers section uses the same toggle pattern', () => {
  seed({ ...emptySpec(), endpoints: [mkEndpoint()] });
  render(<EndpointEditor />);
  const select = screen.getByLabelText('Headers mode') as HTMLSelectElement;
  expect(select.value).toBe('none');
  const refOpt = Array.from(select.options).find((o) => o.value === 'ref')!;
  expect(refOpt.disabled).toBe(true);
});

import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Capture } from '@zwaggen/core';

function seedEndpoint(captures?: Capture[]) {
  const endpoint = {
    id: 'e1',
    method: 'GET' as const,
    path: '/users',
    pathParams: [],
    
    
    requestBody: null,
    responses: [],
    auth: 'inherit' as const,
    useProxy: 'inherit' as const,
    ...(captures !== undefined ? { captures } : {}),
  };
  useSpecStore.setState({
    spec: { ...emptySpec(), endpoints: [endpoint] },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: 'e1',
  });
}

// Case 1: No captures → card renders with Add button only; no rows.
test('no captures → card renders with Add button only, no rows', async () => {
  seedEndpoint();
  render(<EndpointEditor />);

  expect(screen.getByRole('button', { name: /add capture/i })).toBeInTheDocument();
  expect(screen.queryByLabelText('capture-path-0')).toBeNull();
});

// Case 2: Click Add → a row appears with empty inputs.
test('click Add capture → a row appears with empty inputs', async () => {
  seedEndpoint();
  render(<EndpointEditor />);

  await userEvent.click(screen.getByRole('button', { name: /add capture/i }));

  await waitFor(() => {
    expect(screen.getByLabelText('capture-path-0')).toBeInTheDocument();
    expect(screen.getByLabelText('capture-var-0')).toBeInTheDocument();
  });

  expect((screen.getByLabelText('capture-path-0') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('capture-var-0') as HTMLInputElement).value).toBe('');
});

// Case 3: Fill path + setVar → endpoint.captures[0] has those values.
test('fill path + setVar → stored in captures[0]', async () => {
  seedEndpoint();
  render(<EndpointEditor />);

  await userEvent.click(screen.getByRole('button', { name: /add capture/i }));

  await userEvent.type(screen.getByLabelText('capture-path-0'), 'data.token');
  await userEvent.type(screen.getByLabelText('capture-var-0'), 'authToken');

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.captures?.[0]?.path).toBe('data.token');
    expect(ep.captures?.[0]?.setVar).toBe('authToken');
  });
});

// Case 4: Change envName select → endpoint.captures[0].envName is set.
test('change envName select → captures[0].envName is set', async () => {
  // Seed spec with an environment named "staging"
  const base = emptySpec();
  base.environments['staging'] = { variables: [] };
  const endpoint = {
    id: 'e1',
    method: 'GET' as const,
    path: '/users',
    pathParams: [],
    
    
    requestBody: null,
    responses: [],
    auth: 'inherit' as const,
    useProxy: 'inherit' as const,
    captures: [{ path: 'token', setVar: 'myVar' }],
  };
  useSpecStore.setState({
    spec: { ...base, endpoints: [endpoint] },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: 'e1',
  });
  render(<EndpointEditor />);

  const select = screen.getByLabelText('capture-env-0') as HTMLSelectElement;
  await userEvent.selectOptions(select, 'staging');

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.captures?.[0]?.envName).toBe('staging');
  });
});

// Case 5: Clear envName back to default → envName becomes undefined.
test('clear envName back to default → envName is undefined', async () => {
  const base = emptySpec();
  base.environments['staging'] = { variables: [] };
  const endpoint = {
    id: 'e1',
    method: 'GET' as const,
    path: '/users',
    pathParams: [],
    
    
    requestBody: null,
    responses: [],
    auth: 'inherit' as const,
    useProxy: 'inherit' as const,
    captures: [{ path: 'token', setVar: 'myVar', envName: 'staging' }],
  };
  useSpecStore.setState({
    spec: { ...base, endpoints: [endpoint] },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: 'e1',
  });
  render(<EndpointEditor />);

  const select = screen.getByLabelText('capture-env-0') as HTMLSelectElement;
  // Select the empty/default option
  await userEvent.selectOptions(select, '');

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.captures?.[0]?.envName).toBeUndefined();
  });
});

// Case 6: Remove a row → array shrinks.
test('remove a row → array shrinks', async () => {
  seedEndpoint([
    { path: 'token', setVar: 'authToken' },
    { path: 'id', setVar: 'userId' },
  ]);
  render(<EndpointEditor />);

  await userEvent.click(screen.getByLabelText('remove-capture-0'));

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.captures).toHaveLength(1);
    expect(ep.captures?.[0]?.setVar).toBe('userId');
  });
});

// Case 7: Remove the last row → 'captures' in endpoint === false.
test('remove the last row → captures key absent from endpoint', async () => {
  seedEndpoint([{ path: 'token', setVar: 'authToken' }]);
  render(<EndpointEditor />);

  await userEvent.click(screen.getByLabelText('remove-capture-0'));

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect('captures' in ep).toBe(false);
  });
});

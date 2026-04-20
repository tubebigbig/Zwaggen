import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Assertions } from '@zwaggen/core';

function seedEndpoint(assertions?: Assertions) {
  const endpoint = {
    id: 'e1',
    method: 'GET' as const,
    path: '/users',
    pathParams: [],
    queryParams: [],
    headers: [],
    requestBody: null,
    responses: [],
    auth: 'inherit' as const,
    useProxy: 'inherit' as const,
    ...(assertions !== undefined ? { assertions } : {}),
  };
  useSpecStore.setState({
    spec: { ...emptySpec(), endpoints: [endpoint] },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: 'e1',
  });
}

test('type 200 in Expected Status → assertions.expectedStatus === 200', async () => {
  seedEndpoint();
  render(<EndpointEditor />);

  const input = screen.getByLabelText('Expected status');
  await userEvent.clear(input);
  await userEvent.type(input, '200');

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.assertions?.expectedStatus).toBe(200);
  });
});

test('clear all fields → assertions key absent entirely', async () => {
  seedEndpoint({
    expectedStatus: 200,
    maxLatencyMs: 500,
    requiredHeaders: [{ name: 'X-Foo', value: 'bar' }],
  });
  render(<EndpointEditor />);

  // Clear expectedStatus
  const statusInput = screen.getByLabelText('Expected status');
  await userEvent.clear(statusInput);

  // Clear maxLatencyMs
  const latencyInput = screen.getByLabelText('Max latency (ms)');
  await userEvent.clear(latencyInput);

  // Remove the header row
  const removeBtn = screen.getByLabelText('remove-header-0');
  await userEvent.click(removeBtn);

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect('assertions' in ep).toBe(false);
  });
});

test('add a header row then fill name+value → stored in requiredHeaders', async () => {
  seedEndpoint();
  render(<EndpointEditor />);

  await userEvent.click(screen.getByRole('button', { name: /Add header/i }));

  const nameInput = screen.getByLabelText('header-name-0');
  const valueInput = screen.getByLabelText('header-value-0');

  await userEvent.type(nameInput, 'Content-Type');
  await userEvent.type(valueInput, 'application/json');

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.assertions?.requiredHeaders).toEqual([
      { name: 'Content-Type', value: 'application/json' },
    ]);
  });
});

test('remove a header row → removed from the array', async () => {
  seedEndpoint({
    requiredHeaders: [
      { name: 'X-Foo', value: 'foo' },
      { name: 'X-Bar', value: 'bar' },
    ],
  });
  render(<EndpointEditor />);

  const removeBtn = screen.getByLabelText('remove-header-0');
  await userEvent.click(removeBtn);

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect(ep.assertions?.requiredHeaders).toEqual([{ name: 'X-Bar', value: 'bar' }]);
  });
});

test('remove the last header row when that is the only field → assertions key dropped', async () => {
  seedEndpoint({
    requiredHeaders: [{ name: 'X-Foo', value: 'bar' }],
  });
  render(<EndpointEditor />);

  const removeBtn = screen.getByLabelText('remove-header-0');
  await userEvent.click(removeBtn);

  await waitFor(() => {
    const ep = useSpecStore.getState().spec.endpoints[0]!;
    expect('assertions' in ep).toBe(false);
  });
});

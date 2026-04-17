import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

function seedEndpoint(tags?: string[]) {
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
    ...(tags !== undefined ? { tags } : {}),
  };
  useSpecStore.setState({
    spec: { ...emptySpec(), endpoints: [endpoint] },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: 'e1',
  });
}

test('type "users" then Enter → chip appears; endpoint tags equals ["users"]', async () => {
  seedEndpoint();
  render(<EndpointEditor />);

  const input = screen.getByLabelText('Tags');
  await userEvent.type(input, 'users');
  await userEvent.keyboard('{Enter}');

  await waitFor(() => {
    const tags = useSpecStore.getState().spec.endpoints[0]!.tags;
    expect(tags).toEqual(['users']);
  });
  expect(screen.getByText('users')).toBeInTheDocument();
});

test('type "admin," → comma commits; tags is ["users", "admin"]', async () => {
  seedEndpoint(['users']);
  render(<EndpointEditor />);

  const input = screen.getByLabelText('Tags');
  await userEvent.type(input, 'admin,');

  await waitFor(() => {
    const tags = useSpecStore.getState().spec.endpoints[0]!.tags;
    expect(tags).toEqual(['users', 'admin']);
  });
});

test('click chip X on "users" → tags is ["admin"]', async () => {
  seedEndpoint(['users', 'admin']);
  render(<EndpointEditor />);

  const removeBtn = screen.getByLabelText('Remove tag users');
  await userEvent.click(removeBtn);

  await waitFor(() => {
    const tags = useSpecStore.getState().spec.endpoints[0]!.tags;
    expect(tags).toEqual(['admin']);
  });
});

test('remove the last chip → endpoint.tags is undefined (key absent)', async () => {
  seedEndpoint(['admin']);
  render(<EndpointEditor />);

  const removeBtn = screen.getByLabelText('Remove tag admin');
  await userEvent.click(removeBtn);

  await waitFor(() => {
    const endpointAfter = useSpecStore.getState().spec.endpoints[0]!;
    // The key must be absent, not just undefined or []
    expect('tags' in endpointAfter).toBe(false);
  });
});

test('enter a duplicate "users" → no-op; length unchanged', async () => {
  seedEndpoint(['users']);
  render(<EndpointEditor />);

  const input = screen.getByLabelText('Tags');
  await userEvent.type(input, 'users');
  await userEvent.keyboard('{Enter}');

  await waitFor(() => {
    const tags = useSpecStore.getState().spec.endpoints[0]!.tags;
    expect(tags).toHaveLength(1);
    expect(tags).toEqual(['users']);
  });
});

test('Backspace in empty input removes the last chip', async () => {
  seedEndpoint(['users', 'admin']);
  render(<EndpointEditor />);

  const input = screen.getByLabelText('Tags');
  await userEvent.click(input);
  await userEvent.keyboard('{Backspace}');

  await waitFor(() => {
    const tags = useSpecStore.getState().spec.endpoints[0]!.tags;
    expect(tags).toEqual(['users']);
  });
});

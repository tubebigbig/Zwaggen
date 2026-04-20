import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointList } from '../../src/ui/EndpointList';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

test('add endpoint and edit path', async () => {
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false, selectedEndpointId: null });
  render(<><EndpointList /><EndpointEditor /></>);
  await userEvent.click(screen.getByRole('button', { name: 'New endpoint' }));
  const path = await screen.findByLabelText('Path') as HTMLInputElement;
  await userEvent.clear(path);
  // user-event v14 treats '{' as the start of a key spec; '{{' escapes to a literal '{'.
  await userEvent.type(path, '/users/{{id}');
  await waitFor(() => {
    expect(useSpecStore.getState().spec.endpoints[0]!.path).toBe('/users/{id}');
  });
});

test('adds response type for status 200', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [{
        id: 'e1', method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
      }],
      types: { User: { kind: 'object', fields: [] } },
    },
    fileHandle: null, dirty: false,
    selectedEndpointId: 'e1',
  });
  render(<EndpointEditor />);
  await userEvent.click(screen.getByRole('button', { name: 'Add response' }));
  const status = screen.getByLabelText('Status') as HTMLInputElement;
  await userEvent.clear(status);
  await userEvent.type(status, '200');
  expect(useSpecStore.getState().spec.endpoints[0]!.responses).toHaveLength(1);
});

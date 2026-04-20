import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

const seedEndpoint: Endpoint = {
  id: 'e1', method: 'GET', path: '/x', pathParams: [], queryParams: [], headers: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
};

beforeEach(() => {
  useSpecStore.setState({
    spec: { ...emptySpec(), endpoints: [seedEndpoint] },
    selectedEndpointId: 'e1',
    fileHandle: null,
    dirty: false,
  });
});

test('editing the Folder input writes endpoint.folder on blur', async () => {
  const user = userEvent.setup();
  render(<EndpointEditor />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.type(input, '  /auth/admin  ');
  await user.tab();
  const endpoints = useSpecStore.getState().spec.endpoints;
  expect(endpoints[0]!.folder).toBe('auth/admin');
});

test('clearing the Folder input removes the folder field', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [{ ...seedEndpoint, folder: 'auth' }],
    },
    selectedEndpointId: 'e1',
  });
  const user = userEvent.setup();
  render(<EndpointEditor />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.tab();
  const endpoints = useSpecStore.getState().spec.endpoints;
  expect(endpoints[0]!.folder).toBeUndefined();
});

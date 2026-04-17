import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointList } from '../../src/ui/EndpointList';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

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

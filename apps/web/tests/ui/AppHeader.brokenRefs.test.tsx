import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

test('Save is blocked when the spec has broken refs', async () => {
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'ref', ref: 'Missing' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  useSpecStore.setState({ spec, fileHandle: null, dirty: true, selectedEndpointId: null });
  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('broken type reference'));
  alertSpy.mockRestore();
});

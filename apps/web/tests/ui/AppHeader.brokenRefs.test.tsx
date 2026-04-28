import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { useToasts } from '../../src/state/toasts';
import { emptySpec } from '@zwaggen/core';

test('Save is blocked when the spec has broken refs', async () => {
  useToasts.setState({ toasts: [] });
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/x',
    pathParams: [],
    requestBody: { kind: 'ref', ref: 'Missing' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  useSpecStore.setState({ spec, fileHandle: null, dirty: true, selectedEndpointId: null });
  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const ts = useToasts.getState().toasts;
  expect(ts).toHaveLength(1);
  expect(ts[0]?.kind).toBe('error');
  expect(ts[0]?.message).toContain('broken type reference');
});

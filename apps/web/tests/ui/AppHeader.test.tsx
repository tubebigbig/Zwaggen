import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('New replaces current spec', async () => {
  useSpecStore.setState({ spec: emptySpec('Old'), fileHandle: null, dirty: true });
  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'New' }));
  expect(useSpecStore.getState().spec.info.name).toBe('Untitled API');
});

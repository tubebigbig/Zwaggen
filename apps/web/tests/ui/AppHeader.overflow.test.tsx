import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(() => {
  useSpecStore.setState({ spec: emptySpec('X'), fileHandle: null, dirty: false });
});

test('overflow menu groups secondary actions and uses Tailwind responsive classes', async () => {
  const user = userEvent.setup();
  render(<AppHeader />);

  // Inline buttons that MUST always be directly in the toolbar
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Run all/i })).toBeInTheDocument();

  // Secondary actions are mirrored inside the overflow menu
  await user.click(screen.getByRole('button', { name: /more/i }));

  expect(screen.getByRole('menu')).toHaveTextContent('Import OpenAPI');
  expect(screen.getByRole('menu')).toHaveTextContent('Compare');
  expect(screen.getByRole('menu')).toHaveTextContent('New');
  expect(screen.getByRole('menu')).toHaveTextContent('Open');

  // Trigger "New" from the overflow menu and verify its handler fires
  await user.click(screen.getByRole('menuitem', { name: /^New$/ }));
  expect(useSpecStore.getState().spec.info.name).toBe('Untitled API');
});

import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypePanel } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { setUiPref } from '../../src/state/uiPrefs';

beforeEach(() => {
  setUiPref('typesCollapsed', false);
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: { Order: { kind: 'object', fields: [] } },
    },
    fileHandle: null,
    dirty: false,
  });
});

test('clicking "New folder" exposes an input, Enter commits an empty folder row', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  const input = screen.getByRole('textbox', { name: /^New folder$/ });
  await user.type(input, 'auth');
  await user.keyboard('{Enter}');
  // Folder is an ephemeral row in the tree — no toggle button for it, but the label renders.
  expect(screen.getByText('auth')).toBeInTheDocument();
});

test('Escape cancels folder creation without persisting', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  const input = screen.getByRole('textbox', { name: /^New folder$/ });
  await user.type(input, 'auth');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('textbox', { name: /^New folder$/ })).not.toBeInTheDocument();
  expect(screen.queryByText('auth')).not.toBeInTheDocument();
});

test('pending folder disappears once a real folder of the same name exists in the spec', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  const input = screen.getByRole('textbox', { name: /^New folder$/ });
  await user.type(input, 'auth');
  await user.keyboard('{Enter}');
  expect(screen.getByText('auth')).toBeInTheDocument();
  // Simulate a type landing in "auth" — the pending folder should be pruned,
  // the real folder row (rename button) should render instead.
  await act(async () => {
    await useSpecStore.getState().setTypeFolder('Order', 'auth');
  });
  // There is now a rename button on the real 'auth' folder row.
  expect(screen.getAllByRole('button', { name: /Rename folder/ }).length).toBeGreaterThan(0);
});

test('rejects invalid folder name — nothing committed', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  const input = screen.getByRole('textbox', { name: /^New folder$/ });
  await user.type(input, '!!!bad!!!');
  await user.keyboard('{Enter}');
  expect(screen.queryByText('!!!bad!!!')).not.toBeInTheDocument();
});

test('canceling a committed pending folder via the X button removes it', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  const input = screen.getByRole('textbox', { name: /^New folder$/ });
  await user.type(input, 'billing');
  await user.keyboard('{Enter}');
  expect(screen.getByText('billing')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Cancel new folder/ }));
  expect(screen.queryByText('billing')).not.toBeInTheDocument();
});

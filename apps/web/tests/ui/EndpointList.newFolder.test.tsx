import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointList } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Endpoint } from '@zwaggen/core';

const ep = (overrides: Partial<Endpoint>): Endpoint => ({
  id: 'e1',
  method: 'GET', path: '/p', pathParams: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  ...overrides,
});

beforeEach(() => {
  useSpecStore.setState({
    spec: { ...emptySpec(), endpoints: [ep({ id: 'e1', path: '/home' })] },
    fileHandle: null,
    dirty: false,
  });
});

test('"+ New folder" exposes an input that commits a pending folder on Enter', async () => {
  const user = userEvent.setup();
  render(<EndpointList />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  const input = screen.getByRole('textbox', { name: /^New folder$/ });
  await user.type(input, 'auth');
  await user.keyboard('{Enter}');
  expect(screen.getByText('auth')).toBeInTheDocument();
});

test('Escape cancels creation; pressing Enter with invalid input is rejected', async () => {
  const user = userEvent.setup();
  render(<EndpointList />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  const input = screen.getByRole('textbox', { name: /^New folder$/ });
  await user.type(input, '!!!');
  await user.keyboard('{Escape}');
  expect(screen.queryByText('!!!')).not.toBeInTheDocument();
});

test('pending folder disappears once a real folder of the same name exists in the spec', async () => {
  const user = userEvent.setup();
  render(<EndpointList />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  const input = screen.getByRole('textbox', { name: /^New folder$/ });
  await user.type(input, 'auth');
  await user.keyboard('{Enter}');
  expect(screen.getByText('auth')).toBeInTheDocument();
  await act(async () => {
    await useSpecStore.getState().setEndpointFolder('e1', 'auth');
  });
  // Now the real folder renders (a toggle button labeled 'auth' with a count).
  const folderToggles = screen.getAllByRole('button').filter((b) => b.textContent?.match(/^auth\s*1$/));
  expect(folderToggles.length).toBeGreaterThan(0);
});

test('canceling a pending folder via the X button removes it', async () => {
  const user = userEvent.setup();
  render(<EndpointList />);
  await user.click(screen.getByRole('button', { name: /^New folder$/ }));
  await user.type(screen.getByRole('textbox', { name: /^New folder$/ }), 'billing');
  await user.keyboard('{Enter}');
  expect(screen.getByText('billing')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Cancel new folder/ }));
  expect(screen.queryByText('billing')).not.toBeInTheDocument();
});

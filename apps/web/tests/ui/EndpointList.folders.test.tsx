import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointList } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Endpoint } from '@zwaggen/core';

const ep = (overrides: Partial<Endpoint>): Endpoint => ({
  id: Math.random().toString(36).slice(2),
  method: 'GET', path: '/p', pathParams: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  ...overrides,
});

beforeEach(() => {
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false });
});

test('folder mode: any endpoint with a folder → tree view, tag-groups suppressed', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        ep({ id: 'a', folder: 'auth', path: '/login', tags: ['legacy'] }),
        ep({ id: 'b', path: '/root-only' }),
      ],
    },
  });
  render(<EndpointList />);
  expect(screen.getByRole('button', { name: /auth/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /\/root-only/ })).toBeInTheDocument();
  // legacy tag header from groupByTag must not render in folder mode.
  expect(screen.queryByText(/^legacy$/i)).not.toBeInTheDocument();
});

test('tag mode: no folders, at least one tag → existing tag-group behavior preserved', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        ep({ id: 'a', path: '/a', tags: ['alpha'] }),
        ep({ id: 'b', path: '/b' }),
      ],
    },
  });
  render(<EndpointList />);
  expect(screen.getByText(/alpha/i)).toBeInTheDocument();
  expect(screen.getByText(/untagged/i)).toBeInTheDocument();
});

test('flat mode: no folders, no tags → flat list', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [ep({ id: 'a', path: '/a' }), ep({ id: 'b', path: '/b' })],
    },
  });
  render(<EndpointList />);
  expect(screen.queryByText(/untagged/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /\/a/ })).toBeInTheDocument();
});

test('renaming a folder via inline action rewrites every descendant endpoint folder', async () => {
  const user = userEvent.setup();
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        ep({ id: 'a', folder: 'auth', path: '/login' }),
        ep({ id: 'b', folder: 'auth/admin', path: '/sessions' }),
        ep({ id: 'c', path: '/root-only' }),
      ],
    },
  });
  render(<EndpointList />);

  const rename = screen.getAllByRole('button', { name: /Rename folder/ })[0]!;
  await user.click(rename);
  const input = screen.getByRole('textbox', { name: /Rename folder/ });
  await user.clear(input);
  await user.type(input, 'identity');
  await user.keyboard('{Enter}');

  const eps = useSpecStore.getState().spec.endpoints;
  expect(eps.find((e) => e.id === 'a')!.folder).toBe('identity');
  expect(eps.find((e) => e.id === 'b')!.folder).toBe('identity/admin');
  expect(eps.find((e) => e.id === 'c')!.folder).toBeUndefined();
});

test('inline folder rename rejects multi-segment input', async () => {
  const user = userEvent.setup();
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [ep({ id: 'a', folder: 'auth', path: '/login' })],
    },
  });
  render(<EndpointList />);

  const rename = screen.getAllByRole('button', { name: /Rename folder/ })[0]!;
  await user.click(rename);
  const input = screen.getByRole('textbox', { name: /Rename folder/ });
  await user.clear(input);
  await user.type(input, 'foo/bar');
  await user.keyboard('{Enter}');

  expect(useSpecStore.getState().spec.endpoints.find((e) => e.id === 'a')!.folder).toBe('auth');
});

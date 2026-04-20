import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { EndpointList } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

const ep = (overrides: Partial<Endpoint>): Endpoint => ({
  id: Math.random().toString(36).slice(2),
  method: 'GET', path: '/p', pathParams: [], queryParams: [], headers: [],
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

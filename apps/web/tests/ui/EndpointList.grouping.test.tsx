import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointList } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { setUiPref } from '../../src/state/uiPrefs';

function makeEndpoint(id: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, tags?: string[]) {
  return {
    id,
    method,
    path,
    pathParams: [],
    
    
    requestBody: null,
    responses: [],
    auth: 'inherit' as const,
    useProxy: 'inherit' as const,
    ...(tags !== undefined ? { tags } : {}),
  };
}

beforeEach(() => {
  // Reset group collapsed state between tests
  setUiPref('endpointGroupCollapsed', {});
});

// Helper to find group header buttons (uppercase class is the discriminator)
function getGroupHeaders() {
  return screen.getAllByRole('button').filter(
    (btn) => btn.className.includes('uppercase')
  );
}

// Test 1: Two tagged groups with different counts render as collapsible headers
test('two tagged groups render collapsible headers with tag name and count', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        makeEndpoint('e1', 'GET', '/foo', ['users']),
        makeEndpoint('e2', 'POST', '/bar', ['users']),
        makeEndpoint('e3', 'GET', '/baz', ['admin']),
      ],
    },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: null,
  });

  render(<EndpointList />);

  const headers = getGroupHeaders();
  expect(headers).toHaveLength(2);

  // Find users header and admin header
  const usersHeader = headers.find((h) => h.textContent?.toLowerCase().includes('users'))!;
  const adminHeader = headers.find((h) => h.textContent?.toLowerCase().includes('admin'))!;

  expect(usersHeader).toBeDefined();
  expect(adminHeader).toBeDefined();

  // Counts should be rendered
  expect(usersHeader).toHaveTextContent('2');
  expect(adminHeader).toHaveTextContent('1');
});

// Test 2: Click group header hides endpoints; click again shows them
test('clicking a group header collapses and re-expands its endpoints', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        makeEndpoint('e1', 'GET', '/alpha-path', ['alpha']),
        makeEndpoint('e2', 'POST', '/beta-path', ['beta']),
      ],
    },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: null,
  });

  render(<EndpointList />);

  // Initially both endpoints are visible (groups start expanded)
  expect(screen.getByText('/alpha-path')).toBeInTheDocument();
  expect(screen.getByText('/beta-path')).toBeInTheDocument();

  // Click the "alpha" group header to collapse it
  const alphaGroupBtn = screen.getAllByRole('button').find(
    (btn) => btn.className.includes('uppercase') && btn.textContent?.includes('alpha')
  )!;
  await userEvent.click(alphaGroupBtn);

  // /alpha-path endpoint should be hidden
  expect(screen.queryByText('/alpha-path')).not.toBeInTheDocument();
  // /beta-path endpoint should still be visible
  expect(screen.getByText('/beta-path')).toBeInTheDocument();

  // Click again to re-expand
  await userEvent.click(alphaGroupBtn);
  expect(screen.getByText('/alpha-path')).toBeInTheDocument();
});

// Test 3: Multi-tag endpoint appears in both group sections
test('multi-tag endpoint appears in both tagged groups', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        makeEndpoint('e1', 'GET', '/shared-path', ['users', 'admin']),
        makeEndpoint('e2', 'GET', '/users-only', ['users']),
      ],
    },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: null,
  });

  render(<EndpointList />);

  // /shared-path should appear twice (once under each tag)
  const sharedItems = screen.getAllByText('/shared-path');
  expect(sharedItems.length).toBeGreaterThanOrEqual(2);

  // Both group headers should be present
  const headers = getGroupHeaders();
  const groupLabels = headers.map((btn) => btn.textContent);
  expect(groupLabels.some((label) => label?.includes('users'))).toBe(true);
  expect(groupLabels.some((label) => label?.includes('admin'))).toBe(true);
});

// Test 4: Untagged group renders last
test('untagged group renders last after named tags', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        makeEndpoint('e1', 'GET', '/untagged'),
        makeEndpoint('e2', 'GET', '/users', ['users']),
        makeEndpoint('e3', 'GET', '/admin', ['admin']),
      ],
    },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: null,
  });

  render(<EndpointList />);

  const groupButtons = getGroupHeaders();

  // Extract just the text labels (strip count digits)
  const labels = groupButtons.map((btn) => {
    const span = btn.querySelector('span:first-of-type');
    return span?.textContent ?? '';
  });

  // admin and users come before Untagged
  const adminIdx = labels.findIndex((l) => l.toLowerCase().includes('admin'));
  const usersIdx = labels.findIndex((l) => l.toLowerCase().includes('users'));
  const untaggedIdx = labels.findIndex((l) => l.toLowerCase().includes('untagged'));

  expect(adminIdx).toBeGreaterThanOrEqual(0);
  expect(usersIdx).toBeGreaterThanOrEqual(0);
  expect(untaggedIdx).toBeGreaterThanOrEqual(0);

  // Untagged must come after both named tags
  expect(untaggedIdx).toBeGreaterThan(adminIdx);
  expect(untaggedIdx).toBeGreaterThan(usersIdx);
});

// Test 5: Spec with zero tags renders flat list — no group headers
test('spec with no tagged endpoints renders flat list without group headers', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        makeEndpoint('e1', 'GET', '/foo'),
        makeEndpoint('e2', 'POST', '/bar'),
      ],
    },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: null,
  });

  render(<EndpointList />);

  // No uppercase group header buttons should be present
  const groupButtons = screen.getAllByRole('button').filter(
    (btn) => btn.className.includes('uppercase')
  );
  expect(groupButtons).toHaveLength(0);

  // The endpoints should still be visible
  expect(screen.getByText('/foo')).toBeInTheDocument();
  expect(screen.getByText('/bar')).toBeInTheDocument();
});

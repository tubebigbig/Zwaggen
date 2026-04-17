import 'fake-indexeddb/auto';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TypePanel } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { setUiPref } from '../../src/state/uiPrefs';
import { emptySpec } from '../../src/schema/defaults';

/** Check whether the Types panel dialog is visible. */
function isTypesPanelOpen(): boolean {
  return document.querySelector('section[role="dialog"]') !== null;
}

function seedSpec(partial: Partial<ReturnType<typeof emptySpec>>) {
  useSpecStore.getState().replaceSpec(
    { ...emptySpec(), ...partial },
    null,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Unused type — trash enabled, no "Referenced by" list
// ──────────────────────────────────────────────────────────────────────────────
test('unused type: trash enabled and no referenced-by list', async () => {
  seedSpec({
    types: { T: { kind: 'object', fields: [] } },
    endpoints: [],
  });

  render(<TypePanel />);

  const trash = screen.getByRole('button', { name: /delete/i });
  expect(trash).not.toBeDisabled();
  expect(screen.queryByText(/Referenced by/i)).toBeNull();
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Type referenced by an endpoint — trash disabled, list shows entry, click jumps
// ──────────────────────────────────────────────────────────────────────────────
test('type referenced by endpoint: trash disabled, list entry present, click jumps', async () => {
  seedSpec({
    types: { User: { kind: 'object', fields: [] } },
    endpoints: [
      {
        id: 'ep1',
        method: 'POST',
        path: '/users',
        pathParams: [],
        queryParams: [],
        headers: [],
        requestBody: { kind: 'ref', ref: 'User' },
        responses: [],
        auth: 'inherit',
        useProxy: 'inherit',
      },
    ],
  });

  render(<TypePanel />);

  const trash = screen.getByRole('button', { name: /delete/i });
  expect(trash).toBeDisabled();
  expect(trash.title).toMatch(/reference/i);

  // List item with endpoint label
  expect(screen.getByText('POST /users · requestBody')).toBeInTheDocument();

  // Click the list entry — should select endpoint and collapse Types panel
  fireEvent.click(screen.getByText('POST /users · requestBody'));
  expect(useSpecStore.getState().selectedEndpointId).toBe('ep1');
  // Panel should have collapsed (section dialog no longer in DOM)
  expect(isTypesPanelOpen()).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Type referenced by another type — trash disabled, click changes selection
// ──────────────────────────────────────────────────────────────────────────────
test('type referenced by another type: trash disabled, clicking entry switches selection', async () => {
  seedSpec({
    types: {
      User: { kind: 'object', fields: [] },
      Account: {
        kind: 'object',
        fields: [{ name: 'owner', required: true, type: { kind: 'ref', ref: 'User' } }],
      },
    },
    endpoints: [],
  });

  render(<TypePanel />);

  // "Account" comes first alphabetically so it will be selected initially.
  // Navigate to "User" first.
  fireEvent.click(screen.getByText('User'));

  // Now User is selected; Account entry should appear in the usage list.
  // Scope to the "Referenced by" list by aria-label to avoid matching the
  // sidebar type-list entry, which is also inside a <ul>.
  const usageList = screen.getByRole('list', { name: /referenced by/i });
  const accountUsageBtn = within(usageList).getByText('Account');
  expect(accountUsageBtn).toBeInTheDocument();
  fireEvent.click(accountUsageBtn);

  // After switching to Account, Account has no usages — the "Referenced by"
  // block should disappear and the trash button should be enabled.
  expect(screen.queryByText(/Referenced by/i)).toBeNull();
  const trash = screen.getByRole('button', { name: /delete/i });
  expect(trash).not.toBeDisabled();

  // Panel should NOT be collapsed (dialog still visible)
  expect(isTypesPanelOpen()).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Self-ref — trash enabled; clicking it removes the type
// ──────────────────────────────────────────────────────────────────────────────
test('self-referencing type: trash enabled and click removes the type', async () => {
  seedSpec({
    types: {
      Tree: {
        kind: 'object',
        fields: [
          {
            name: 'children',
            required: false,
            type: { kind: 'array', element: { kind: 'ref', ref: 'Tree' } },
          },
        ],
      },
    },
    endpoints: [],
  });

  render(<TypePanel />);

  const trash = screen.getByRole('button', { name: /delete/i });
  expect(trash).not.toBeDisabled();

  fireEvent.click(trash);

  // Allow async setSpec to settle
  await new Promise((r) => setTimeout(r, 0));

  expect(useSpecStore.getState().spec.types).not.toHaveProperty('Tree');
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Defensive guard — clicking disabled button leaves spec unchanged
// ──────────────────────────────────────────────────────────────────────────────
test('defensive guard: clicking disabled trash on used type leaves spec unchanged', async () => {
  seedSpec({
    types: { User: { kind: 'object', fields: [] } },
    endpoints: [
      {
        id: 'ep2',
        method: 'GET',
        path: '/me',
        pathParams: [],
        queryParams: [],
        headers: [],
        requestBody: { kind: 'ref', ref: 'User' },
        responses: [],
        auth: 'inherit',
        useProxy: 'inherit',
      },
    ],
  });

  render(<TypePanel />);

  const specBefore = useSpecStore.getState().spec;

  const trash = screen.getByRole('button', { name: /delete/i });
  expect(trash).toBeDisabled();

  // fireEvent.click goes through even on a disabled button in jsdom — the guard
  // in remove() must catch it.
  fireEvent.click(trash);

  await new Promise((r) => setTimeout(r, 0));

  expect(useSpecStore.getState().spec).toEqual(specBefore);
});

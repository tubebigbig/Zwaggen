import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
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
      types: {
        'Order': { kind: 'object', fields: [] },
        'auth/User': { kind: 'object', fields: [] },
        'auth/admin/Session': { kind: 'object', fields: [] },
      },
    },
    fileHandle: null,
    dirty: false,
  });
});

test('renders a folder tree when any type has a slash in its key', () => {
  render(<TypePanel />);
  // root-level type visible at the top
  expect(screen.getByRole('button', { name: /Order/ })).toBeInTheDocument();
  // folder nodes rendered
  expect(screen.getByRole('button', { name: /auth/ })).toBeInTheDocument();
  // nested items reachable after expanding
  expect(screen.getByRole('button', { name: /User/ })).toBeInTheDocument();
});

test('falls back to the flat list when no type has a folder', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: { A: { kind: 'object', fields: [] }, B: { kind: 'object', fields: [] } },
    },
  });
  render(<TypePanel />);
  expect(screen.queryByRole('button', { name: /Rename folder/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^A$/ })).toBeInTheDocument();
});

test('renaming a folder via inline action rewrites all descendant type keys', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  // Folder rename moved into a per-row 3-dot OverflowMenu — open it from the
  // 'auth' folder row, then click the "Rename folder" menuitem.
  await openFolderMenuAndClickRename(user, /^auth$/);
  const input = screen.getByRole('textbox', { name: /Rename folder/ });
  await user.clear(input);
  await user.type(input, 'identity');
  await user.keyboard('{Enter}');
  expect(useSpecStore.getState().spec.types['identity/User']).toBeDefined();
  expect(useSpecStore.getState().spec.types['auth/User']).toBeUndefined();
});

test('renaming a folder preserves the selection at the new key', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  // Click the nested Session item to select it; its key is auth/admin/Session.
  await user.click(screen.getByRole('button', { name: /Session/ }));
  // Rename the top-level 'auth' folder via its row's 3-dot menu.
  await openFolderMenuAndClickRename(user, /^auth$/);
  const input = screen.getByRole('textbox', { name: /Rename folder/ });
  await user.clear(input);
  await user.type(input, 'identity');
  await user.keyboard('{Enter}');
  // The selected key should now be identity/admin/Session — the spec should reflect the rename.
  expect(useSpecStore.getState().spec.types['identity/admin/Session']).toBeDefined();
  expect(useSpecStore.getState().spec.types['auth/admin/Session']).toBeUndefined();
});

test('clearing the type name input does not create a garbage key ending in /', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  // Select the nested type (key: auth/User).
  await user.click(screen.getByRole('button', { name: /^User$/ }));
  const nameInput = screen.getByLabelText('Type name') as HTMLInputElement;
  await user.clear(nameInput);
  await user.tab();
  // No garbage key in the spec, original key still present.
  const keys = Object.keys(useSpecStore.getState().spec.types);
  expect(keys).not.toContain('auth/');
  expect(keys).toContain('auth/User');
});

test('inline folder rename rejects multi-segment input', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  await openFolderMenuAndClickRename(user, /^auth$/);
  const input = screen.getByRole('textbox', { name: /Rename folder/ });
  await user.clear(input);
  await user.type(input, 'foo/bar');
  await user.keyboard('{Enter}');
  // The rename should not have taken effect — auth still exists, foo/bar does not.
  expect(useSpecStore.getState().spec.types['auth/User']).toBeDefined();
  expect(useSpecStore.getState().spec.types['foo/bar/User']).toBeUndefined();
});

async function openFolderMenuAndClickRename(
  user: ReturnType<typeof userEvent.setup>,
  folderName: RegExp,
) {
  // Folder rows render the folder name as a toggle button; the 3-dot
  // OverflowMenu sits as a sibling within the same row container. Find the
  // folder name <span> directly, climb to the row, find the row's "More"
  // button, open it, then click the "Rename folder" menuitem. Matching the
  // span (instead of the toggle button's full a11y name) avoids the trailing
  // total-count number in the button label.
  const span = Array.from(document.querySelectorAll('span')).find(
    (el) => folderName.test(el.textContent ?? ''),
  );
  if (!span) throw new Error(`folder header span matching ${folderName} not found`);
  const row = span.closest('div.group') as HTMLElement;
  const more = row.querySelector('button[aria-label="More"]') as HTMLButtonElement;
  await user.click(more);
  const rename = await screen.findByRole('menuitem', { name: /Rename folder/ });
  await user.click(rename);
}

import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { TypePanel } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { setUiPref } from '../../src/state/uiPrefs';

beforeEach(async () => {
  const s = emptySpec();
  s.types['auth/User'] = { kind: 'object', fields: [] };
  await useSpecStore.getState().replaceSpec(s, null);
  // Make sure the TypePanel slide-out is open (default may be collapsed).
  setUiPref('typesCollapsed', false);
});

it('clicking + on a type folder row creates a new type in that folder and selects it', async () => {
  render(<TypePanel />);
  const folderHeader = screen.getByText('auth');
  const row = folderHeader.closest('.group') as HTMLElement;
  expect(row).not.toBeNull();
  const addBtn = within(row).getByRole('button', { name: /add type to this folder/i });
  await userEvent.click(addBtn);

  const types = useSpecStore.getState().spec.types;
  const newKey = Object.keys(types).find((k) => k.startsWith('auth/') && k !== 'auth/User');
  expect(newKey).toBeDefined();
  expect(newKey).toMatch(/^auth\/NewType/);
});

it('clicking + folder on a type folder row pre-fills the new-folder input with the parent prefix', async () => {
  render(<TypePanel />);
  const folderHeader = screen.getByText('auth');
  const row = folderHeader.closest('.group') as HTMLElement;
  expect(row).not.toBeNull();
  const addFolderBtn = within(row).getByRole('button', { name: /add subfolder/i });
  await userEvent.click(addFolderBtn);
  const input = screen.getByRole('textbox', { name: /new folder/i }) as HTMLInputElement;
  expect(input.value).toBe('auth/');
});

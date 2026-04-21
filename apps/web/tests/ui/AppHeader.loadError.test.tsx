import 'fake-indexeddb/auto';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { emptySpec } from '@zwaggen/core';
import { useSpecStore } from '../../src/state/store';

vi.mock('../../src/storage/file', () => ({
  supportsFileSystemAccess: () => false,
  pickOpen: vi.fn(),
  readFile: vi.fn(),
  uploadFile: vi.fn(),
  pickSave: vi.fn(),
  downloadBlob: vi.fn(),
  writeFile: vi.fn(),
}));

import { AppHeader } from '../../src/ui/AppHeader';
import * as fileModule from '../../src/storage/file';

async function clickOpen() {
  // AppHeader renders an inline Open button at xl+ and an overflow menu item below xl.
  // The inline button's accessible name is the `t('open')` label ("Open").
  const buttons = screen.getAllByRole('button', { name: /^Open$/ });
  await userEvent.click(buttons[0]!);
}

beforeEach(async () => {
  await act(async () => {
    await useSpecStore.getState().replaceSpec(emptySpec(), null);
  });
});

describe('AppHeader load-error modal', () => {
  it('surfaces a modal with the filename and SyntaxError for malformed JSON', async () => {
    vi.mocked(fileModule.uploadFile).mockResolvedValueOnce({
      name: 'broken.zwaggen.json',
      text: '{not json',
    });
    render(<AppHeader />);
    await clickOpen();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('broken.zwaggen.json');
    expect(dialog.textContent ?? '').toMatch(/JSON/i);
  });

  it('surfaces a modal with SpecVersionError message for newer schemaVersion', async () => {
    vi.mocked(fileModule.uploadFile).mockResolvedValueOnce({
      name: 'future.zwaggen.json',
      text: JSON.stringify({ schemaVersion: 999, info: { name: 'x', baseUrl: '' } }),
    });
    render(<AppHeader />);
    await clickOpen();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('future.zwaggen.json');
    expect(dialog).toHaveTextContent(/schemaVersion 999/);
  });

  it('dismissing the modal clears it and leaves the store untouched', async () => {
    const before = useSpecStore.getState().spec;
    vi.mocked(fileModule.uploadFile).mockResolvedValueOnce({
      name: 'broken.json',
      text: 'not json',
    });
    render(<AppHeader />);
    await clickOpen();
    const dialog = await screen.findByRole('dialog');
    const dismissButtons = within(dialog).getAllByRole('button', { name: /dismiss/i });
    // There are two buttons named "Dismiss" — the top-right close (X icon, aria-label)
    // and the bottom-right text button. Either triggers onClose.
    await userEvent.click(dismissButtons[dismissButtons.length - 1]!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useSpecStore.getState().spec).toEqual(before);
  });
});

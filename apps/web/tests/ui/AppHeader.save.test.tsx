import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { getStorage } from '../../src/storage/spec-storage';
import * as fileIo from '../../src/storage/file';

beforeEach(async () => {
  // Reset to a known state and force the spec to be dirty so Save proceeds.
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
  await useSpecStore.getState().setSpec(emptySpec('Edited'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('Save → writeFile rejection surfaces alert + draft preserved', async () => {
  // FSA path: stub supports + pickSave returning a fake handle, then reject writeFile.
  const storage = getStorage();
  vi.spyOn(storage, 'supportsNativePicker').mockReturnValue(true);
  const fakeHandle = {} as never;
  vi.spyOn(storage, 'pickSave').mockResolvedValue(fakeHandle);
  vi.spyOn(storage, 'writeFile').mockRejectedValue(new Error('quota exceeded'));
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Save failed.*quota exceeded/));
  expect(useSpecStore.getState().dirty).toBe(true);
});

test('Save fallback (no FSA support) downloads blob, preserves draft, shows hint', async () => {
  const storage = getStorage();
  vi.spyOn(storage, 'supportsNativePicker').mockReturnValue(false);
  const downloadSpy = vi.spyOn(fileIo, 'downloadBlob').mockImplementation(() => {});
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(downloadSpy).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Downloaded.*draft is preserved/));
  expect(useSpecStore.getState().dirty).toBe(true);
});

test('Save → cancelled picker is a no-op (no alert, draft preserved, writeFile not called)', async () => {
  const storage = getStorage();
  vi.spyOn(storage, 'supportsNativePicker').mockReturnValue(true);
  // null simulates the AbortError-handled cancel path landed in Task 1.
  vi.spyOn(storage, 'pickSave').mockResolvedValue(null);
  const writeSpy = vi.spyOn(storage, 'writeFile');
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(writeSpy).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(useSpecStore.getState().dirty).toBe(true);
});

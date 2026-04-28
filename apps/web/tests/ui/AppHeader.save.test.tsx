import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { getStorage } from '../../src/storage/spec-storage';

// downloadBlob calls URL.createObjectURL — jsdom doesn't implement it. Stub
// so the real downloadBlob (used by tests that don't intercept it via mock)
// doesn't throw.
beforeEach(async () => {
  // Reset to a known state and force the spec to be dirty so Save proceeds.
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
  await useSpecStore.getState().setSpec(emptySpec('Edited'));
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  await waitFor(() => {
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Save failed.*quota exceeded/));
  });
  expect(useSpecStore.getState().dirty).toBe(true);
});

test('Save fallback (no FSA support) downloads blob, preserves draft, shows hint', async () => {
  const storage = getStorage();
  vi.spyOn(storage, 'supportsNativePicker').mockReturnValue(false);
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  // downloadBlob's real implementation runs (ESM live-binding can't be patched
  // via vi.spyOn for a directly-imported function); the URL.createObjectURL
  // stub from beforeEach lets it complete without throwing. The alert is the
  // proof we entered the download branch.
  await waitFor(() => {
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Downloaded.*draft is preserved/));
  });
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

  // pickSave was called and resolved null — saveSpec returned without other side effects.
  // Wait a tick to ensure all microtasks settle, then assert.
  await waitFor(() => {
    expect(storage.pickSave).toHaveBeenCalled();
  });
  expect(writeSpy).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(useSpecStore.getState().dirty).toBe(true);
});

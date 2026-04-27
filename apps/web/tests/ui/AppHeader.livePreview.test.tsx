import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { setUiPref } from '../../src/state/uiPrefs';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
  // Reset the persisted toggle so each test starts from a known state.
  setUiPref('livePreviewOpen', false);
});

it('AppHeader live-preview button reflects and toggles uiPrefs.livePreviewOpen', async () => {
  render(<AppHeader />);
  const btn = screen.getByRole('button', { name: /live preview/i });
  expect(btn).toHaveAttribute('aria-pressed', 'false');

  await userEvent.click(btn);
  expect(btn).toHaveAttribute('aria-pressed', 'true');

  await userEvent.click(btn);
  expect(btn).toHaveAttribute('aria-pressed', 'false');
});

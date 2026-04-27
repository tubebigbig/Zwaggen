import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ExportPopover } from '../../src/ui/ExportPopover';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders a dialog with a close button', async () => {
  const onClose = vi.fn();
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={onClose} />);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /dismiss|close/i }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('Escape closes the dialog', async () => {
  const onClose = vi.fn();
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={onClose} />);
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('shows the scope in the title', () => {
  const onClose = vi.fn();
  render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={onClose} />);
  expect(screen.getByRole('heading')).toHaveTextContent(/getUser/);
});

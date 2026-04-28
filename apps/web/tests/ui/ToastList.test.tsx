import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { ToastList } from '../../src/ui/ToastList';
import { useToasts } from '../../src/state/toasts';

beforeEach(() => {
  useToasts.setState({ toasts: [] });
});

it('renders nothing when there are no toasts', () => {
  const { container } = render(<ToastList />);
  expect(container.firstChild).toBeNull();
});

it('renders each toast and dismisses on click', async () => {
  // Use a long duration so auto-dismiss doesn't fire during the test.
  useToasts.getState().pushToast('hello world', 'info', 60000);
  render(<ToastList />);
  expect(screen.getByText('hello world')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
  expect(screen.queryByText('hello world')).toBeNull();
});

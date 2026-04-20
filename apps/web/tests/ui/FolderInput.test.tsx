import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderInput } from '../../src/ui/FolderInput';

test('commits a normalized path on blur', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FolderInput value={undefined} onChange={onChange} />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.type(input, '  /auth//admin/  ');
  await user.tab();
  expect(onChange).toHaveBeenCalledWith('auth/admin');
});

test('commits undefined for empty input', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FolderInput value="auth" onChange={onChange} />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.tab();
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test('shows inline error and does not commit on invalid input', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FolderInput value="auth" onChange={onChange} />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.type(input, 'bad?seg');
  await user.tab();
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('Escape reverts the input to the initial value', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FolderInput value="auth" onChange={onChange} />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.type(input, 'temp');
  await user.keyboard('{Escape}');
  expect(input.value).toBe('auth');
  expect(onChange).not.toHaveBeenCalled();
});

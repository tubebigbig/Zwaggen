import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverflowMenu } from '../../src/ui/OverflowMenu';

test('opens on click, closes on outside click and Escape', async () => {
  const user = userEvent.setup();
  render(
    <div>
      <OverflowMenu>
        <button>Child A</button>
        <button>Child B</button>
      </OverflowMenu>
      <div data-testid="outside">outside</div>
    </div>,
  );

  // closed initially
  expect(screen.queryByText('Child A')).not.toBeInTheDocument();

  // opens on trigger click
  await user.click(screen.getByRole('button', { name: /more/i }));
  expect(screen.getByText('Child A')).toBeVisible();
  expect(screen.getByText('Child B')).toBeVisible();

  // Escape closes
  await user.keyboard('{Escape}');
  expect(screen.queryByText('Child A')).not.toBeInTheDocument();

  // reopen, then outside click closes
  await user.click(screen.getByRole('button', { name: /more/i }));
  await user.click(screen.getByTestId('outside'));
  expect(screen.queryByText('Child A')).not.toBeInTheDocument();
});

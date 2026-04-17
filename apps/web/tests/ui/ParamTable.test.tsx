import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ParamTable } from '../../src/ui/ParamTable';
import type { ParamDef } from '../../src/schema/types';

function Harness() {
  const [ps, setPs] = useState<ParamDef[]>([]);
  return <ParamTable title="Query" value={ps} onChange={setPs} typeNames={[]} />;
}

test('adds a param and edits name', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Add param' }));
  const name = screen.getByLabelText('Param name') as HTMLInputElement;
  await userEvent.type(name, 'page');
  expect(name.value).toBe('page');
});

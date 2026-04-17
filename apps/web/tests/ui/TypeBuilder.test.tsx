import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { TypeBuilder } from '../../src/ui/TypeBuilder';
import type { TypeDef } from '../../src/schema/types';

function Harness({ initial }: { initial: TypeDef }) {
  const [t, setT] = useState<TypeDef>(initial);
  return <TypeBuilder value={t} onChange={setT} typeNames={[]} />;
}

test('switches kind', async () => {
  render(<Harness initial={{ kind: 'string' }} />);
  const select = screen.getByLabelText('Kind');
  await userEvent.selectOptions(select, 'integer');
  expect((select as HTMLSelectElement).value).toBe('integer');
});

test('adds object field', async () => {
  render(<Harness initial={{ kind: 'object', fields: [] }} />);
  await userEvent.click(screen.getByRole('button', { name: /Add field/ }));
  expect(screen.getByLabelText(/^field name/)).toBeInTheDocument();
});

test('string constraints render', async () => {
  render(<Harness initial={{ kind: 'string' }} />);
  await userEvent.click(screen.getByRole('button', { name: /Constraints/ }));
  expect(screen.getByLabelText('minLength')).toBeInTheDocument();
  expect(screen.getByLabelText('pattern')).toBeInTheDocument();
});

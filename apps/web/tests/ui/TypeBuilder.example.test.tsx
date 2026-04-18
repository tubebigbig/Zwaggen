import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { TypeBuilder } from '../../src/ui/TypeBuilder';
import type { TypeDef } from '../../src/schema/types';

function Harness({
  initial,
  onChangeSpy,
}: {
  initial: TypeDef;
  onChangeSpy?: (next: TypeDef) => void;
}) {
  const [t, setT] = useState<TypeDef>(initial);
  return (
    <TypeBuilder
      value={t}
      onChange={(next) => {
        setT(next);
        onChangeSpy?.(next);
      }}
      typeNames={[]}
    />
  );
}

test('valid JSON commits example to object type', async () => {
  const spy = vi.fn<[TypeDef], void>();
  render(<Harness initial={{ kind: 'object', fields: [] }} onChangeSpy={spy} />);

  const textarea = screen.getByLabelText('Example (JSON)');
  fireEvent.change(textarea, { target: { value: '{"id":"u_1"}' } });
  fireEvent.blur(textarea);

  const lastArg = spy.mock.calls[spy.mock.calls.length - 1][0] as any;
  expect(lastArg.example).toEqual({ id: 'u_1' });
});

test('empty blur drops the example key', async () => {
  const spy = vi.fn<[TypeDef], void>();
  render(
    <Harness
      initial={{ kind: 'object', fields: [], example: { id: 'x' } }}
      onChangeSpy={spy}
    />
  );

  const textarea = screen.getByLabelText('Example (JSON)');
  fireEvent.change(textarea, { target: { value: '' } });
  fireEvent.blur(textarea);

  const lastArg = spy.mock.calls[spy.mock.calls.length - 1][0] as any;
  expect('example' in lastArg).toBe(false);
});

test('invalid JSON shows error and does not change example', async () => {
  const spy = vi.fn<[TypeDef], void>();
  render(
    <Harness
      initial={{ kind: 'object', fields: [], example: { id: 'x' } }}
      onChangeSpy={spy}
    />
  );

  const textarea = screen.getByLabelText('Example (JSON)');
  fireEvent.change(textarea, { target: { value: 'not json' } });
  fireEvent.blur(textarea);

  expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON');

  // onChange should not have been called with a different example value
  const callsWithNewExample = spy.mock.calls.filter(
    ([next]) => (next as any).example !== undefined && (next as any).example?.id !== 'x'
  );
  expect(callsWithNewExample).toHaveLength(0);
});

test('primitive type (string) renders no example textarea', () => {
  render(<Harness initial={{ kind: 'string' }} />);
  expect(screen.queryByLabelText('Example (JSON)')).toBeNull();
});

test('array type renders the example textarea', () => {
  render(
    <Harness
      initial={{ kind: 'array', element: { kind: 'string' } }}
    />
  );
  expect(screen.getByLabelText('Example (JSON)')).toBeInTheDocument();
});

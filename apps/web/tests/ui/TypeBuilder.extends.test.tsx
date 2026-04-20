import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { TypeBuilder } from '../../src/ui/TypeBuilder';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type ObjectType } from '@zwaggen/core';

function seedSpec(types: Record<string, ObjectType>) {
  const spec = emptySpec();
  for (const [k, v] of Object.entries(types)) spec.types[k] = v;
  // setState is sync; bypasses the async setSpec flow so tests don't race
  // persistence.
  act(() => {
    useSpecStore.setState({ spec, fileHandle: null, dirty: false });
  });
}

test('renders the Extends chip picker for object types', () => {
  seedSpec({
    Base: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] },
    User: { kind: 'object', fields: [] },
  });
  const value: ObjectType = { kind: 'object', fields: [] };
  render(
    <TypeBuilder
      value={value}
      onChange={() => {}}
      typeNames={['Base']}
      selectedKey="User"
    />,
  );
  // The Extends label renders (picker header + select aria-label share the
  // i18n string).
  expect(screen.getAllByText(/Extends/i).length).toBeGreaterThan(0);
});

test('does not render the Extends picker for non-object types', () => {
  render(
    <TypeBuilder
      value={{ kind: 'string' }}
      onChange={() => {}}
      typeNames={['Base']}
    />,
  );
  expect(screen.queryByText(/Extends/i)).toBeNull();
});

test('clicking Override on an inherited field appends it to the child fields and fires onChange', async () => {
  seedSpec({
    Base: {
      kind: 'object',
      fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
    },
    User: { kind: 'object', extends: ['Base'], fields: [] },
  });

  const user = userEvent.setup();
  const onChange = vi.fn();
  const userType = useSpecStore.getState().spec.types['User'] as ObjectType;
  render(
    <TypeBuilder
      value={userType}
      onChange={onChange}
      typeNames={['Base']}
      selectedKey="User"
    />,
  );

  // The inherited panel is expanded by default and lists a single row with
  // an Override button (aria-label = "Override id").
  const overrideBtn = await screen.findByRole('button', { name: /Override id/i });
  await user.click(overrideBtn);

  expect(onChange).toHaveBeenCalledTimes(1);
  const next = onChange.mock.calls[0]![0] as ObjectType;
  expect(next.kind).toBe('object');
  expect(next.extends).toEqual(['Base']);
  expect(next.fields.map((f) => f.name)).toEqual(['id']);
  expect(next.fields[0]!.required).toBe(true);
  expect(next.fields[0]!.type).toEqual({ kind: 'string' });
});

test('own field matching an inherited name shows the (override) badge and Revert action', async () => {
  seedSpec({
    Base: {
      kind: 'object',
      fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
    },
    User: {
      kind: 'object',
      extends: ['Base'],
      fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
    },
  });

  const user = userEvent.setup();
  const onChange = vi.fn();
  const userType = useSpecStore.getState().spec.types['User'] as ObjectType;
  render(
    <TypeBuilder
      value={userType}
      onChange={onChange}
      typeNames={['Base']}
      selectedKey="User"
    />,
  );

  expect(screen.getByText(/\(override\)/i)).toBeInTheDocument();

  const revertBtn = screen.getByRole('button', { name: /Revert to inherited id/i });
  await user.click(revertBtn);

  expect(onChange).toHaveBeenCalledTimes(1);
  const next = onChange.mock.calls[0]![0] as ObjectType;
  expect(next.fields).toEqual([]);
  expect(next.extends).toEqual(['Base']);
});

test('adding a parent via the Extends picker fires onChange with the updated extends list', async () => {
  seedSpec({
    Base: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] },
    User: { kind: 'object', fields: [] },
  });

  const user = userEvent.setup();
  const onChange = vi.fn();
  const userType = useSpecStore.getState().spec.types['User'] as ObjectType;
  render(
    <TypeBuilder
      value={userType}
      onChange={onChange}
      typeNames={['Base']}
      selectedKey="User"
    />,
  );

  // The picker renders a select with aria-label "Extends".
  const picker = screen.getByLabelText('Extends', { selector: 'select' }) as HTMLSelectElement;
  await user.selectOptions(picker, 'Base');

  expect(onChange).toHaveBeenCalled();
  const next = onChange.mock.calls[0]![0] as ObjectType;
  expect(next.extends).toEqual(['Base']);
});

test('the Extends picker excludes cycle-inducing candidates', () => {
  // A extends B; from B's perspective, adding A would create a cycle, so A
  // should not appear in B's picker options.
  seedSpec({
    A: { kind: 'object', extends: ['B'], fields: [] },
    B: { kind: 'object', fields: [] },
  });

  const bType = useSpecStore.getState().spec.types['B'] as ObjectType;
  render(
    <TypeBuilder
      value={bType}
      onChange={() => {}}
      typeNames={['A']}
      selectedKey="B"
    />,
  );

  // The only candidate is A, but A would cycle, so the select should have
  // no "A" option.
  const picker = screen.queryByLabelText('Extends', { selector: 'select' }) as HTMLSelectElement | null;
  // When there are no candidates, the picker renders a plain "No parents"
  // hint instead of a select element.
  if (picker) {
    const opts = Array.from(picker.options).map((o) => o.value);
    expect(opts).not.toContain('A');
  }
});

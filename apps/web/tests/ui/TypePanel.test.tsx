import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypePanel } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('add and rename a type updates refs', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: { User: { kind: 'object', fields: [] } },
      endpoints: [{
        id: 'e1', method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null,
        responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
        auth: 'inherit', useProxy: 'inherit',
      }],
    },
    fileHandle: null, dirty: false,
  });
  render(<TypePanel />);
  const input = screen.getByLabelText('Type name') as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, 'Account');
  input.blur();
  await screen.findByText('Account');
  const { endpoints } = useSpecStore.getState().spec;
  expect(endpoints[0]!.responses[0]!.type).toEqual({ kind: 'ref', ref: 'Account' });
});

test('rapid add-type does not clobber the previously-selected type', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: { UserId: { kind: 'object', fields: [] } },
    },
    fileHandle: null,
    dirty: false,
  });

  render(<TypePanel />);

  const nameInput = screen.getByLabelText('Type name') as HTMLInputElement;
  expect(nameInput.value).toBe('UserId');

  // Race reproducer: user focuses the rename input and edits its DOM value,
  // then a new type is added (changing `selected`). The old input should
  // either be remounted (with key={selected}) or not fire its stale blur.
  //
  // Without the fix:
  //   - The input is not remounted on selection change.
  //   - The DOM value is still 'UserEdited' (uncontrolled defaultValue is
  //     ignored on re-render).
  //   - When blur finally fires, the current render's onBlur runs:
  //     rename(selected='NewType', 'UserEdited'), silently renaming the
  //     newly-added NewType to UserEdited.
  //
  // With key={selected}:
  //   - Selection change unmounts the old input and mounts a new one with
  //     defaultValue='NewType'. The stale DOM value is discarded.
  //   - No blur fires on the unmounted node; the new input keeps its fresh
  //     defaultValue.
  await act(async () => {
    nameInput.focus();
  });
  // Write new text into the uncontrolled DOM value. Don't use userEvent —
  // we want to avoid triggering blur or React synthetic change events.
  nameInput.value = 'UserEdited';

  // Click the "+" button via fireEvent (not userEvent) so we don't steal
  // focus from the input. This mimics the real-browser behaviour where a
  // button click does NOT blur the focused input on Chrome/Safari macOS.
  fireEvent.click(screen.getByLabelText(/add type/i));

  // Wait for addType's async setSpec + setSelected to fully flush, i.e.
  // the NewType list button to become the active selection. Active selection
  // is signaled by the `bg-brand-50` class on the list button.
  await waitFor(() => {
    const btn = screen.getByRole('button', { name: /^NewType$/ });
    expect(btn.className).toMatch(/bg-brand-50/);
  });

  // Now blur the still-focused old input. With the fix, the old input has
  // been unmounted (key change), so the currently-focused element is the
  // fresh input with defaultValue='NewType' — its blur fires
  // rename('NewType', 'NewType'), a no-op. Without the fix, the same DOM
  // node is still mounted with stale DOM value 'UserEdited', and the
  // current render's onBlur closure captures selected='NewType', so blur
  // fires rename('NewType', 'UserEdited'), silently clobbering the just-
  // added NewType.
  await act(async () => {
    const stillFocused = document.activeElement as HTMLElement | null;
    if (stillFocused && stillFocused.tagName === 'INPUT') {
      fireEvent.blur(stillFocused);
    }
  });

  const types = Object.keys(useSpecStore.getState().spec.types);
  expect(types).toContain('UserId');
  expect(types).toContain('NewType');
});

import 'fake-indexeddb/auto';
import { resolveTypeFolderFromDragEnd, TYPE_PANEL_ROOT_ID } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import type { DragEndEvent } from '@dnd-kit/core';

beforeEach(() => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: {
        'auth/User': { kind: 'object', fields: [] },
        'billing/Invoice': { kind: 'object', fields: [] },
      },
    },
    fileHandle: null,
    dirty: false,
  });
});

function dragEnd(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
}

test('moving a type into another folder renames its canonical key', async () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'billing'));
  expect(resolved).toEqual({ typeKey: 'auth/User', folder: 'billing' });
  await useSpecStore.getState().setTypeFolder(resolved!.typeKey, resolved!.folder);
  const keys = Object.keys(useSpecStore.getState().spec.types).sort();
  expect(keys).toContain('billing/User');
  expect(keys).toContain('billing/Invoice');
  expect(keys).not.toContain('auth/User');
});

test('dropping onto the root zone strips the folder from the canonical key', async () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', TYPE_PANEL_ROOT_ID));
  expect(resolved).toEqual({ typeKey: 'auth/User', folder: null });
  await useSpecStore.getState().setTypeFolder(resolved!.typeKey, resolved!.folder);
  const keys = Object.keys(useSpecStore.getState().spec.types).sort();
  expect(keys).toContain('User');
  expect(keys).not.toContain('auth/User');
});

test('dropping into the same folder is a no-op', async () => {
  const before = { ...useSpecStore.getState().spec.types };
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'auth'));
  expect(resolved).toBeNull();
  // Even if a caller forwards the resolution, setTypeFolder is idempotent.
  await useSpecStore.getState().setTypeFolder('auth/User', 'auth');
  expect(useSpecStore.getState().spec.types).toEqual(before);
});

test('dropping onto self is a no-op', () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'auth/User'));
  expect(resolved).toBeNull();
});

test('dropping outside any droppable (no over) is a no-op', () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', null));
  expect(resolved).toBeNull();
});

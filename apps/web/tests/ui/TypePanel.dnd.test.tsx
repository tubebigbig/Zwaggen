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

function keys() {
  return Object.keys(useSpecStore.getState().spec.types);
}

test('moving a type into another folder renames its canonical key', async () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'billing'), keys());
  expect(resolved).toEqual({ typeKey: 'auth/User', folder: 'billing' });
  await useSpecStore.getState().setTypeFolder(resolved!.typeKey, resolved!.folder);
  const after = Object.keys(useSpecStore.getState().spec.types).sort();
  expect(after).toContain('billing/User');
  expect(after).toContain('billing/Invoice');
  expect(after).not.toContain('auth/User');
});

test('dropping onto the root zone strips the folder from the canonical key', async () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', TYPE_PANEL_ROOT_ID), keys());
  expect(resolved).toEqual({ typeKey: 'auth/User', folder: null });
  await useSpecStore.getState().setTypeFolder(resolved!.typeKey, resolved!.folder);
  const after = Object.keys(useSpecStore.getState().spec.types).sort();
  expect(after).toContain('User');
  expect(after).not.toContain('auth/User');
});

test('dropping onto a root-level sibling row lands at root, not in a folder named after it', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: {
        'auth/User': { kind: 'object', fields: [] },
        Order: { kind: 'object', fields: [] },
      },
    },
  });
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'Order'), keys());
  expect(resolved).toEqual({ typeKey: 'auth/User', folder: null });
});

test('dropping onto a sibling row inside a folder inherits that folder', () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'billing/Invoice'), keys());
  expect(resolved).toEqual({ typeKey: 'auth/User', folder: 'billing' });
});

test('dropping onto a sibling in the same folder is a no-op', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: {
        'auth/User': { kind: 'object', fields: [] },
        'auth/Session': { kind: 'object', fields: [] },
      },
    },
  });
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'auth/Session'), keys());
  expect(resolved).toBeNull();
});

test('dropping into the same folder is a no-op', async () => {
  const before = { ...useSpecStore.getState().spec.types };
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'auth'), keys());
  expect(resolved).toBeNull();
  // Even if a caller forwards the resolution, setTypeFolder is idempotent.
  await useSpecStore.getState().setTypeFolder('auth/User', 'auth');
  expect(useSpecStore.getState().spec.types).toEqual(before);
});

test('dropping onto self is a no-op', () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', 'auth/User'), keys());
  expect(resolved).toBeNull();
});

test('dropping outside any droppable (no over) is a no-op', () => {
  const resolved = resolveTypeFolderFromDragEnd(dragEnd('auth/User', null), keys());
  expect(resolved).toBeNull();
});

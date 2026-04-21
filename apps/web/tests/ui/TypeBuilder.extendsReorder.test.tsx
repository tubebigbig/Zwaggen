import 'fake-indexeddb/auto';
import { reorderExtendsFromDragEnd } from '../../src/ui/TypeBuilder';
import type { DragEndEvent } from '@dnd-kit/core';

function dragEnd(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
}

test('reorders parents when dragging a chip onto another', () => {
  const next = reorderExtendsFromDragEnd(['A', 'B', 'C'], dragEnd('A', 'B'));
  expect(next).toEqual(['B', 'A', 'C']);
});

test('no-op when active and over are the same id', () => {
  const next = reorderExtendsFromDragEnd(['A', 'B', 'C'], dragEnd('B', 'B'));
  expect(next).toBeNull();
});

test('no-op when dropped outside any chip (no over)', () => {
  const next = reorderExtendsFromDragEnd(['A', 'B', 'C'], dragEnd('A', null));
  expect(next).toBeNull();
});

test('reverse reorder works (last → first)', () => {
  const next = reorderExtendsFromDragEnd(['A', 'B', 'C'], dragEnd('C', 'A'));
  expect(next).toEqual(['C', 'A', 'B']);
});

test('no-op when id is not a known parent (e.g. after a race)', () => {
  const next = reorderExtendsFromDragEnd(['A', 'B'], dragEnd('Ghost', 'A'));
  expect(next).toBeNull();
});

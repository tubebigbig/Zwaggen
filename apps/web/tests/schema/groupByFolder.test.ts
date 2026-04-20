import { expect, test } from 'vitest';
import { groupByFolder, FolderNode } from '../../src/schema/groupByFolder';

interface Item { id: string; folder?: string }

test('flat input with no folders → every item at root', () => {
  const items: Item[] = [{ id: 'A' }, { id: 'B' }];
  const root = groupByFolder(items, (i) => i.folder);
  expect(root.items.map((i) => i.id)).toEqual(['A', 'B']);
  expect(root.children).toEqual([]);
});

test('nested folders produce a tree sorted alphabetically at each level', () => {
  const items: Item[] = [
    { id: '1', folder: 'zeta' },
    { id: '2', folder: 'alpha/nested' },
    { id: '3' },                        // root
    { id: '4', folder: 'alpha' },
  ];
  const root = groupByFolder(items, (i) => i.folder);
  expect(root.items.map((i) => i.id)).toEqual(['3']);
  expect(root.children.map((c) => c.name)).toEqual(['alpha', 'zeta']);

  const alpha = root.children[0]!;
  expect(alpha.path).toBe('alpha');
  expect(alpha.items.map((i) => i.id)).toEqual(['4']);
  expect(alpha.children.map((c) => c.name)).toEqual(['nested']);

  const nested = alpha.children[0]!;
  expect(nested.path).toBe('alpha/nested');
  expect(nested.items.map((i) => i.id)).toEqual(['2']);
});

test('items inside a folder preserve insertion order', () => {
  const items: Item[] = [
    { id: 'c', folder: 'x' },
    { id: 'a', folder: 'x' },
    { id: 'b', folder: 'x' },
  ];
  const root = groupByFolder(items, (i) => i.folder);
  expect(root.children[0]!.items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
});

test('FolderNode exposes a totalCount across descendants', () => {
  const items: Item[] = [
    { id: '1', folder: 'a' },
    { id: '2', folder: 'a/b' },
    { id: '3', folder: 'a/b/c' },
  ];
  const root = groupByFolder(items, (i) => i.folder);
  const a = root.children[0]!;
  expect(a.totalCount).toBe(3);
  expect(a.children[0]!.totalCount).toBe(2);
});

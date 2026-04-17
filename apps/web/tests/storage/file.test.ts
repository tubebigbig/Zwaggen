import { expect, test, vi } from 'vitest';
import { supportsFileSystemAccess, writeFile, readFile } from '../../src/storage/file';

test('detects File System Access API absence', () => {
  const original = (globalThis as any).showOpenFilePicker;
  delete (globalThis as any).showOpenFilePicker;
  expect(supportsFileSystemAccess()).toBe(false);
  if (original) (globalThis as any).showOpenFilePicker = original;
});

test('writeFile uses handle when provided', async () => {
  const write = vi.fn();
  const close = vi.fn();
  const handle = { createWritable: vi.fn(async () => ({ write, close })) } as any;
  await writeFile('{"a":1}', handle);
  expect(write).toHaveBeenCalledWith('{"a":1}');
  expect(close).toHaveBeenCalled();
});

test('readFile returns handle text', async () => {
  const file = new File(['{"k":1}'], 'spec.json', { type: 'application/json' });
  const handle = { getFile: async () => file } as any;
  const { text, name } = await readFile(handle);
  expect(JSON.parse(text)).toEqual({ k: 1 });
  expect(name).toBe('spec.json');
});

import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractSpecPath } from '../argv';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'zwag-argv-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

test('returns null when no spec-shaped arg is present', () => {
  expect(extractSpecPath(['/path/to/electron', '/path/to/main.cjs'])).toBeNull();
  expect(extractSpecPath(['/path/to/electron', '--flag'])).toBeNull();
});

test('returns the first existing .zwag file', async () => {
  const p = join(dir, 'spec.zwag');
  await writeFile(p, '{}');
  expect(extractSpecPath(['electron', 'main.cjs', p])).toBe(p);
});

test('also recognises .zwag.json and .json', async () => {
  const a = join(dir, 'spec.zwag.json');
  const b = join(dir, 'spec.json');
  await writeFile(a, '{}');
  await writeFile(b, '{}');
  expect(extractSpecPath(['electron', a])).toBe(a);
  expect(extractSpecPath(['electron', b])).toBe(b);
});

test('skips spec-shaped args that do not exist on disk', async () => {
  const real = join(dir, 'real.zwag');
  await writeFile(real, '{}');
  expect(extractSpecPath(['electron', '/nope/missing.zwag', real])).toBe(real);
});

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromJSON } from '@zwaggen/core';
import { generateZod } from '../../src/generate/zod.js';
import { format } from '../../src/generate/format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixtureSpec() {
  const raw = await readFile(join(__dirname, 'fixtures/codegen-fixture.json'), 'utf8');
  return fromJSON(JSON.parse(raw));
}

async function loadExpected() {
  return readFile(join(__dirname, 'fixtures/expected-zod.ts'), 'utf8');
}

async function loadV11FixtureSpec() {
  const raw = await readFile(join(__dirname, 'fixtures/codegen-v1.1-fixture.json'), 'utf8');
  return fromJSON(JSON.parse(raw));
}

async function loadV11Expected() {
  return readFile(join(__dirname, 'fixtures/expected-zod-v1.1.ts'), 'utf8');
}

describe('generateZod', () => {
  it('matches the frozen fixture output exactly', async () => {
    const spec = await loadFixtureSpec();
    const out = await format(generateZod(spec));
    const expected = await loadExpected();
    expect(out).toBe(expected);
  });

  it('imports z from zod', async () => {
    const spec = await loadFixtureSpec();
    const out = generateZod(spec);
    expect(out).toContain("import { z } from 'zod'");
  });

  it('emits z.object for object types', async () => {
    const spec = await loadFixtureSpec();
    const out = generateZod(spec);
    expect(out).toContain('export const UserSchema = z.object({');
  });

  it('marks optional fields with .optional()', async () => {
    const spec = await loadFixtureSpec();
    const out = generateZod(spec);
    expect(out).toMatch(/email:\s*z\.string\(\)\.optional\(\)/);
  });

  it('extends via .extend({})', async () => {
    const spec = await loadFixtureSpec();
    const out = generateZod(spec);
    expect(out).toContain('UserSchema.extend({');
    expect(out).toContain('AdminSchema');
  });

  it('emits z.enum for string literal unions', async () => {
    const spec = await loadFixtureSpec();
    const out = generateZod(spec);
    expect(out).toMatch(/z\.enum\(\[['"]admin['"],\s*['"]super-admin['"]\]\)/);
  });

  it('emits z.array for array types', async () => {
    const spec = await loadFixtureSpec();
    const out = generateZod(spec);
    expect(out).toMatch(/UserListSchema =\s*z\.array\(UserSchema\)/);
  });

  it('re-exports inferred types', async () => {
    const spec = await loadFixtureSpec();
    const out = generateZod(spec);
    expect(out).toMatch(/export type User = z\.infer<typeof UserSchema>/);
  });

  it('matches the v1.1 fixture golden byte-for-byte', async () => {
    const spec = await loadV11FixtureSpec();
    const out = await format(generateZod(spec));
    const expected = await loadV11Expected();
    expect(out).toBe(expected);
  });
});

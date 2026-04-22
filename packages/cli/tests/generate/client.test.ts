import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromJSON } from '@zwaggen/core';
import { generateClient } from '../../src/generate/client.js';
import { format } from '../../src/generate/format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadFixtureSpec() {
  const raw = await readFile(join(__dirname, 'fixtures/codegen-fixture.json'), 'utf8');
  return fromJSON(JSON.parse(raw));
}

async function loadExpected() {
  return readFile(join(__dirname, 'fixtures/expected-client.ts'), 'utf8');
}

describe('generateClient', () => {
  it('matches the frozen fixture output exactly', async () => {
    const spec = await loadFixtureSpec();
    const out = await format(generateClient(spec));
    const expected = await loadExpected();
    expect(out).toBe(expected);
  });

  it('exports createClient factory', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toContain('export function createClient(opts: ZwaggenClientOptions)');
  });

  it('groups endpoints by tag', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toContain('users: {');
  });

  it('substitutes path parameters', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toMatch(/\$\{opts\.baseUrl\}\/users\/\$\{input\.id\}/);
  });

  it('parses responses through Zod', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toMatch(/UserSchema\.parse\(/);
    expect(out).toMatch(/z\.array\(UserSchema\)\.parse\(/);
  });

  it('throws ZwaggenHttpError on non-OK', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toContain('export class ZwaggenHttpError');
    expect(out).toMatch(/throw new ZwaggenHttpError/);
  });

  it('serializes JSON body for POST', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toContain("'content-type': 'application/json'");
    expect(out).toContain('JSON.stringify(input.body)');
  });
});

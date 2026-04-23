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
    expect(out).toMatch(/\$\{opts\.baseUrl\}\/users\/\$\{encodeURIComponent\(input\["id"\]\)\}/);
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

  it('appends query string for queryParams via URLSearchParams', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toContain('new URLSearchParams()');
    expect(out).toMatch(/qs\.set\("q"/);
    expect(out).toMatch(/qs\.set\("limit"/);
  });

  it('emits per-endpoint header in input type and fetch headers', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toContain("'X-Request-Id': string");
    expect(out).toMatch(/"X-Request-Id":\s*input\["X-Request-Id"\]/);
  });

  it('URL-encodes path params', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toMatch(/encodeURIComponent\(input\["id"\]\)/);
  });
});

describe('generateClient — camelized tag groups', () => {
  it('camelizes hyphenated tag names in the output object property', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {},
      endpoints: [
        {
          id: 'list-users',
          method: 'GET',
          path: '/users',
          tags: ['user-management'],
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).toContain('userManagement: {');
    expect(out).not.toContain("'user-management'");
  });
});

describe('generateClient — async headers', () => {
  it("OPTIONS_INTERFACE includes the async () => Promise<Record<string,string>> variant", async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toContain('Promise<Record<string, string>>');
    expect(out).toContain('(() => Promise<Record<string, string>>)');
  });

  it('emits an async baseHeaders helper and awaits it at every call site', async () => {
    const spec = await loadFixtureSpec();
    const out = generateClient(spec);
    expect(out).toContain('const baseHeaders = async (): Promise<Record<string, string>>');
    // No bare baseHeaders() left in the body — every call awaits.
    expect(out).not.toMatch(/[^t] baseHeaders\(\)/);
    expect(out).toMatch(/await baseHeaders\(\)/);
  });
});

describe('generateClient — inline-object expansion in tsRefType', () => {
  it('expands an inline requestBody object instead of falling through to unknown', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {},
      endpoints: [
        {
          id: 'search',
          method: 'POST',
          path: '/search',
          tags: ['default'],
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: {
            kind: 'object',
            fields: [
              { name: 'query', required: true, type: { kind: 'string' } },
              { name: 'page', required: false, type: { kind: 'integer' } },
            ],
          },
          responses: [{ status: 200, type: { kind: 'object', fields: [] } }],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).toContain('body: { query: string; page?: number }');
    expect(out).not.toMatch(/body: unknown/);
  });

  it('recurses into nested inline objects and resolves nested refs through sanitization', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {
        'auth/User': {
          kind: 'object',
          fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
        },
      },
      endpoints: [
        {
          id: 'do-thing',
          method: 'POST',
          path: '/x',
          tags: ['default'],
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: {
            kind: 'object',
            fields: [
              {
                name: 'actor',
                required: true,
                type: { kind: 'ref', ref: 'auth/User' },
              },
              {
                name: 'meta',
                required: false,
                type: {
                  kind: 'object',
                  fields: [
                    { name: 'note', required: false, type: { kind: 'string' } },
                  ],
                },
              },
            ],
          },
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).toContain('body: { actor: auth_User; meta?: { note?: string } }');
  });
});

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

async function loadV11FixtureSpec() {
  const raw = await readFile(join(__dirname, 'fixtures/codegen-v1.1-fixture.json'), 'utf8');
  return fromJSON(JSON.parse(raw));
}

async function loadV11Expected() {
  return readFile(join(__dirname, 'fixtures/expected-client-v1.1.ts'), 'utf8');
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

  it('matches the v1.1 fixture golden byte-for-byte', async () => {
    const spec = await loadV11FixtureSpec();
    const out = await format(generateClient(spec));
    const expected = await loadV11Expected();
    expect(out).toBe(expected);
  });

  it('object-typed query param flattens in client input and URL builder', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {
        Filter: {
          kind: 'object',
          fields: [
            { name: 'status', required: true, type: { kind: 'string' } },
            { name: 'category', required: false, type: { kind: 'string' } },
          ],
        },
      },
      endpoints: [
        {
          id: 'list',
          method: 'GET',
          path: '/items',
          tags: ['default'],
          pathParams: [],
          queryParams: { kind: 'ref', ref: 'Filter' },
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    // Input shape uses field names, not the parent param name or its ref type.
    expect(out).toContain('status: string');
    expect(out).toContain('category?: string');
    expect(out).not.toContain('filter: Filter');
    expect(out).not.toMatch(/filter\?: Filter/);
    // URL builder iterates field-level keys.
    expect(out).toMatch(/qs\.set\("status"/);
    expect(out).toMatch(/qs\.set\("category"/);
    expect(out).not.toMatch(/qs\.set\("filter"/);
  });

  it('object-typed header param flattens in client input and headers spread', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {
        Tracing: {
          kind: 'object',
          fields: [
            { name: 'X-Request-Id', required: true, type: { kind: 'string' } },
          ],
        },
      },
      endpoints: [
        {
          id: 'ping',
          method: 'GET',
          path: '/ping',
          tags: ['default'],
          pathParams: [],
          queryParams: [],
          headers: { kind: 'ref', ref: 'Tracing' },
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).toContain("'X-Request-Id': string");
    expect(out).toMatch(/"X-Request-Id":\s*input\["X-Request-Id"\]/);
    expect(out).not.toMatch(/"tracing":\s*input\["tracing"\]/);
  });
});

describe('generateClient — bodyContentType branches', () => {
  it('emits a URLSearchParams body and urlencoded Content-Type for urlencoded endpoints', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {},
      endpoints: [
        {
          id: 'login',
          method: 'POST',
          path: '/login',
          tags: ['auth'],
          pathParams: [],
          requestBody: null,
          bodyContentType: 'urlencoded',
          bodyForm: [
            { name: 'username', required: true, type: { kind: 'string' } },
            { name: 'password', required: true, type: { kind: 'string' } },
          ],
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).toContain("'content-type': 'application/x-www-form-urlencoded'");
    expect(out).toContain('new URLSearchParams(input.body as Record<string, string>).toString()');
    // Inline body shape from bodyForm
    expect(out).toContain('body: { username: string; password: string }');
    // No JSON.stringify path for this endpoint
    expect(out).not.toMatch(/login.*JSON\.stringify/s);
  });

  it('emits real FormData for multipart text-only endpoints', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {},
      endpoints: [
        {
          id: 'upload',
          method: 'POST',
          path: '/upload',
          tags: ['files'],
          pathParams: [],
          requestBody: null,
          bodyContentType: 'multipart',
          bodyForm: [{ name: 'note', required: true, type: { kind: 'string' } }],
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).not.toContain('multipart bodies are not yet supported');
    expect(out).not.toContain('multipart bodies not yet supported');
    expect(out).toContain('const fd = new FormData();');
    expect(out).toContain('fd.append("note", String(input.body["note"]));');
    // Multipart endpoints leave Content-Type unset so fetch supplies the boundary.
    expect(out).not.toContain("'content-type': 'multipart/form-data'");
    // Body type still appears in the input shape
    expect(out).toContain('body: { note: string }');
  });

  it('emits real FormData for multipart endpoints with file fields', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {},
      endpoints: [
        {
          id: 'upload',
          method: 'POST',
          path: '/upload',
          tags: ['files'],
          pathParams: [],
          requestBody: null,
          bodyContentType: 'multipart',
          bodyForm: [
            { name: 'note', required: true, type: { kind: 'string' } },
            { name: 'attachment', required: true, type: { kind: 'file' } },
            { name: 'optional', required: false, type: { kind: 'file' } },
          ],
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).not.toContain('multipart bodies are not yet supported');
    expect(out).toContain('const fd = new FormData();');
    // Required string field appended unconditionally
    expect(out).toContain('fd.append("note", String(input.body["note"]));');
    // Required file field appends with filename
    expect(out).toContain('fd.append("attachment", input.body["attachment"] as File, (input.body["attachment"] as File).name);');
    // Optional file field is gated on undefined
    expect(out).toContain('if (input.body["optional"] !== undefined) fd.append("optional", input.body["optional"] as File, (input.body["optional"] as File).name);');
    // Input type uses File for file fields
    expect(out).toContain('body: { note: string; attachment: File; optional?: File }');
  });

  it('aborts when a file type appears outside multipart bodyForm', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {},
      endpoints: [
        {
          id: 'login',
          method: 'POST',
          path: '/login',
          tags: ['auth'],
          pathParams: [],
          requestBody: null,
          bodyContentType: 'urlencoded',
          bodyForm: [{ name: 'badFile', required: true, type: { kind: 'file' } }],
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    expect(() => generateClient(spec)).toThrow(/illegal file type placements/i);
  });

  it('emits the Node 20 + globalThis.File header note', async () => {
    const baseSpec = await loadFixtureSpec();
    const out = generateClient(baseSpec);
    expect(out).toMatch(/globalThis\.File/);
    expect(out).toMatch(/Node 20/);
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

describe('generateClient — inline-object expansion in zodTypeExpr (v1.2)', () => {
  it('inline-object response shapes generate z.object expansion (not z.unknown)', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {},
      endpoints: [
        {
          id: 'list',
          method: 'GET',
          path: '/items',
          tags: ['default'],
          pathParams: [],
          requestBody: null,
          responses: [{
            status: 200,
            type: {
              kind: 'array',
              element: {
                kind: 'object',
                fields: [
                  { name: 'id', required: true, type: { kind: 'integer' } },
                  { name: 'name', required: false, type: { kind: 'string' } },
                ],
              },
            },
          }],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).toContain('z.array(z.object({');
    expect(out).toContain('"id": z.number()');
    expect(out).toContain('"name": z.string().optional()');
    expect(out).not.toMatch(/z\.array\(z\.unknown\(\)\)/);
  });

  it('empty inline-object responses emit z.object({})', async () => {
    const baseSpec = await loadFixtureSpec();
    const spec = {
      ...baseSpec,
      types: {},
      endpoints: [
        {
          id: 'ping',
          method: 'GET',
          path: '/ping',
          tags: ['default'],
          pathParams: [],
          requestBody: null,
          responses: [{ status: 200, type: { kind: 'object', fields: [] } }],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as typeof baseSpec;
    const out = generateClient(spec);
    expect(out).toContain('z.object({}).parse');
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

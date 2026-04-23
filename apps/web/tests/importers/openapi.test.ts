import { describe, expect, it } from 'vitest';
import { fromOpenApi } from '../../src/importers/openapi';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec, type ObjectType, type Endpoint } from '@zwaggen/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap a single schema under components.schemas.T and run fromOpenApi */
function parseSchema(schema: unknown) {
  const { spec, warnings } = fromOpenApi({
    openapi: '3.1.0',
    info: { title: 'Test', version: '0.0.0' },
    components: { schemas: { T: schema } },
  });
  return { type: spec.types['T'], warnings };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('primitives', () => {
  it('string with constraints and enum', () => {
    const { type, warnings } = parseSchema({
      type: 'string',
      minLength: 3,
      pattern: '^\\w+$',
      enum: ['a', 'b'],
    });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({
      kind: 'string',
      minLength: 3,
      pattern: '^\\w+$',
      enum: ['a', 'b'],
    });
  });

  it('number with min/max', () => {
    const { type, warnings } = parseSchema({
      type: 'number',
      minimum: 0,
      maximum: 100,
    });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'number', min: 0, max: 100 });
  });

  it('integer bare', () => {
    const { type, warnings } = parseSchema({ type: 'integer' });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'integer' });
  });

  it('boolean', () => {
    const { type, warnings } = parseSchema({ type: 'boolean' });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'boolean' });
  });

  it('null', () => {
    const { type, warnings } = parseSchema({ type: 'null' });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'null' });
  });

  it('const string', () => {
    const { type, warnings } = parseSchema({ const: 'X' });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'literal', value: 'X' });
  });
});

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

describe('containers', () => {
  it('array with items and minItems', () => {
    const { type, warnings } = parseSchema({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({
      kind: 'array',
      element: { kind: 'string' },
      minItems: 1,
    });
  });

  it('object with required and optional fields', () => {
    const { type, warnings } = parseSchema({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    });
    expect(warnings).toHaveLength(0);
    expect(type).toMatchObject({ kind: 'object' });
    const obj = type as ObjectType;
    expect(obj.fields).toHaveLength(2);
    const nameField = obj.fields.find((f) => f.name === 'name');
    const ageField = obj.fields.find((f) => f.name === 'age');
    expect(nameField?.required).toBe(true);
    expect(nameField?.type).toEqual({ kind: 'string' });
    expect(ageField?.required).toBe(false);
    expect(ageField?.type).toEqual({ kind: 'integer' });
  });

  it('strict object with no properties', () => {
    const { type, warnings } = parseSchema({
      type: 'object',
      additionalProperties: false,
      properties: {},
    });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'object', fields: [], strict: true });
  });
});

// ---------------------------------------------------------------------------
// $ref
// ---------------------------------------------------------------------------

describe('$ref', () => {
  it('local #/components/schemas/ ref resolves to kind:ref', () => {
    const { type, warnings } = parseSchema({
      $ref: '#/components/schemas/User',
    });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'ref', ref: 'User' });
  });

  it('external $ref emits warning and returns undefined', () => {
    const { type, warnings } = parseSchema({
      $ref: 'https://example.com/schema.json',
    });
    expect(type).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/https:\/\/example\.com\/schema\.json/);
  });
});

// ---------------------------------------------------------------------------
// Top-level mapping
// ---------------------------------------------------------------------------

describe('top-level', () => {
  it('maps info and servers correctly', () => {
    const { spec, warnings } = fromOpenApi({
      openapi: '3.1.0',
      info: { title: 'Example', version: '1.0' },
      servers: [{ url: 'https://api.example.com' }],
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              age: { type: 'integer' },
            },
            required: ['id'],
          },
        },
      },
    });
    expect(warnings).toHaveLength(0);
    expect(spec.info.name).toBe('Example');
    expect(spec.info.version).toBe('1.0');
    expect(spec.info.baseUrl).toBe('https://api.example.com');

    const user = spec.types['User'] as ObjectType;
    expect(user).toBeDefined();
    expect(user.kind).toBe('object');
    expect(user.fields).toHaveLength(2);
    const idField = user.fields.find((f) => f.name === 'id');
    expect(idField?.required).toBe(true);
  });

  it('baseUrl is undefined when no servers array', () => {
    const { spec } = fromOpenApi({
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0' },
    });
    expect(spec.info.baseUrl).toBeUndefined();
  });

  it('returns empty spec with warning when doc is not an object', () => {
    const { spec, warnings } = fromOpenApi('not an object');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Document is not an object/);
    expect(spec.types).toEqual({});
    expect(spec.endpoints).toEqual([]);
  });

  it('returns empty spec with warning when doc is a number', () => {
    const { spec, warnings } = fromOpenApi(42);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Document is not an object/);
    expect(Object.keys(spec.types)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unions + edge cases
// ---------------------------------------------------------------------------

describe('unions + edge cases', () => {
  it('oneOf produces a union', () => {
    const { type, warnings } = parseSchema({
      oneOf: [{ type: 'string' }, { type: 'integer' }],
    });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({
      kind: 'union',
      variants: [{ kind: 'string' }, { kind: 'integer' }],
    });
  });

  it('anyOf produces a union and emits a warning', () => {
    const { type, warnings } = parseSchema({
      anyOf: [{ type: 'string' }, { type: 'integer' }],
    });
    expect(type).toEqual({
      kind: 'union',
      variants: [{ kind: 'string' }, { kind: 'integer' }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/anyOf treated as union/);
  });

  it('allOf with two objects merges fields (first-write-wins)', () => {
    const { type, warnings } = parseSchema({
      allOf: [
        {
          type: 'object',
          properties: { id: { type: 'string' }, name: { type: 'string' } },
          required: ['id'],
        },
        {
          type: 'object',
          properties: { name: { type: 'integer' }, age: { type: 'integer' } },
          required: ['age'],
        },
      ],
    });
    expect(warnings).toHaveLength(0);
    expect(type).toMatchObject({ kind: 'object' });
    const obj = type as ObjectType;
    // All three distinct names present
    expect(obj.fields.map((f) => f.name).sort()).toEqual(['age', 'id', 'name']);
    // first-write-wins: 'name' comes from the first allOf member → string, required:false
    const nameField = obj.fields.find((f) => f.name === 'name');
    expect(nameField?.type).toEqual({ kind: 'string' });
    expect(nameField?.required).toBe(false);
    // 'id' required from first member
    expect(obj.fields.find((f) => f.name === 'id')?.required).toBe(true);
    // 'age' required from second member
    expect(obj.fields.find((f) => f.name === 'age')?.required).toBe(true);
  });

  it('allOf with a non-object member emits warning and returns undefined', () => {
    const { type, warnings } = parseSchema({
      allOf: [
        { type: 'object', properties: { id: { type: 'string' } } },
        { type: 'string' },
      ],
    });
    expect(type).toBeUndefined();
    expect(warnings.some((w) => w.includes('allOf member is not an object'))).toBe(true);
  });

  it('allOf preserves first non-empty description from parts', () => {
    const { type, warnings } = parseSchema({
      allOf: [
        { type: 'object', description: 'first doc', properties: { a: { type: 'string' } } },
        { type: 'object', description: 'second doc', properties: { b: { type: 'integer' } } },
      ],
    });
    expect(warnings).toHaveLength(0);
    expect(type).toMatchObject({ kind: 'object', description: 'first doc' });
  });

  it('allOf gains strict: true when any member has additionalProperties: false', () => {
    const { type, warnings } = parseSchema({
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', additionalProperties: false, properties: { b: { type: 'string' } } },
      ],
    });
    expect(warnings).toHaveLength(0);
    expect(type).toMatchObject({ kind: 'object', strict: true });
  });

  it('allOf omits description and strict when neither is set on any part', () => {
    const { type, warnings } = parseSchema({
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'string' } } },
      ],
    });
    expect(warnings).toHaveLength(0);
    expect('description' in (type as any)).toBe(false);
    expect('strict' in (type as any)).toBe(false);
  });

  it('multi-type type array produces a union', () => {
    const { type, warnings } = parseSchema({ type: ['string', 'null'] });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({
      kind: 'union',
      variants: [{ kind: 'string' }, { kind: 'null' }],
    });
  });

  it('single-element type array is unwrapped (no union wrapper)', () => {
    const { type, warnings } = parseSchema({ type: ['string'] });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'string' });
  });

  it('nullable: true wraps type in union with null and emits warning', () => {
    const { type, warnings } = parseSchema({ type: 'string', nullable: true });
    expect(type).toEqual({
      kind: 'union',
      variants: [{ kind: 'string' }, { kind: 'null' }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/nullable: true is a 3\.0 pattern/);
  });

  it('example is attached to object output', () => {
    const example = { id: 'abc' };
    const { type, warnings } = parseSchema({
      type: 'object',
      properties: { id: { type: 'string' } },
      example,
    });
    expect(warnings).toHaveLength(0);
    expect((type as ObjectType & { example?: unknown }).example).toEqual(example);
  });

  it('example on primitive is ignored (no example attribute)', () => {
    const { type, warnings } = parseSchema({
      type: 'string',
      example: 'hello',
    });
    expect(warnings).toHaveLength(0);
    expect(type).toEqual({ kind: 'string' });
    expect((type as unknown as Record<string, unknown>).example).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Helper: build a minimal doc with one endpoint
// ---------------------------------------------------------------------------

function parseEndpoint(pathsDoc: unknown): { endpoint: Endpoint; warnings: string[] } {
  const { spec, warnings } = fromOpenApi({
    openapi: '3.1.0',
    info: { title: 'Test', version: '0.0.0' },
    components: {
      schemas: {
        User: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },
    paths: pathsDoc,
  });
  return { endpoint: spec.endpoints[0] as Endpoint, warnings };
}

// ---------------------------------------------------------------------------
// Paths → endpoints
// ---------------------------------------------------------------------------

describe('paths → endpoints', () => {
  it('1: minimal POST endpoint with requestBody, response, and tags', () => {
    const { endpoint, warnings } = parseEndpoint({
      '/users': {
        post: {
          tags: ['users'],
          summary: 'Create user',
          requestBody: {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/User' } },
            },
          },
          responses: {
            '201': {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
      },
    });
    expect(warnings).toHaveLength(0);
    expect(endpoint.method).toBe('POST');
    expect(endpoint.path).toBe('/users');
    expect(endpoint.description).toBe('Create user');
    expect(endpoint.requestBody).toEqual({ kind: 'ref', ref: 'User' });
    expect(endpoint.responses).toHaveLength(1);
    expect(endpoint.responses[0]!.status).toBe(201);
    expect(endpoint.tags).toEqual(['users']);
    expect(endpoint.auth).toBe('inherit');
  });

  it('2: path-level parameters propagate to operations', () => {
    const { endpoint, warnings } = parseEndpoint({
      '/users/{id}': {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: {} },
                },
              },
            },
          },
        },
      },
    });
    expect(warnings).toHaveLength(0);
    expect(endpoint.pathParams).toHaveLength(1);
    expect(endpoint.pathParams[0]!.name).toBe('id');
    expect(endpoint.pathParams[0]!.required).toBe(true);
  });

  it('3: params split by in: path, query, header', () => {
    const { endpoint, warnings } = parseEndpoint({
      '/items/{id}': {
        get: {
          parameters: [
            { name: 'id', in: 'path', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'X-Trace-Id', in: 'header', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              content: { 'application/json': { schema: { type: 'object', properties: {} } } },
            },
          },
        },
      },
    });
    expect(warnings).toHaveLength(0);
    expect(endpoint.pathParams.map((p) => p.name)).toEqual(['id']);
    expect(endpoint.queryParams.map((p) => p.name)).toEqual(['limit']);
    expect(endpoint.headers.map((p) => p.name)).toEqual(['X-Trace-Id']);
  });

  it('4: non-JSON requestBody leaves requestBody null and pushes warning', () => {
    const { endpoint, warnings } = parseEndpoint({
      '/upload': {
        post: {
          requestBody: {
            content: { 'application/xml': { schema: { type: 'string' } } },
          },
          responses: {},
        },
      },
    });
    expect(endpoint.requestBody).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/application\/json/);
  });

  it('5: default response maps to status 0 and pushes warning', () => {
    const { endpoint, warnings } = parseEndpoint({
      '/err': {
        get: {
          responses: {
            default: {
              content: {
                'application/json': { schema: { type: 'object', properties: {} } },
              },
            },
          },
        },
      },
    });
    expect(endpoint.responses).toHaveLength(1);
    expect(endpoint.responses[0]!.status).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/default response mapped to status 0/);
  });

  it('6: response without a JSON schema is skipped', () => {
    const { endpoint, warnings } = parseEndpoint({
      '/nothing': {
        delete: {
          responses: { '204': {} },
        },
      },
    });
    expect(warnings).toHaveLength(0);
    expect(endpoint.responses).toHaveLength(0);
  });

  it('7: path param without explicit required: true defaults to required', () => {
    const { endpoint } = parseEndpoint({
      '/things/{id}': {
        get: {
          parameters: [
            { name: 'id', in: 'path', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              content: { 'application/json': { schema: { type: 'object', properties: {} } } },
            },
          },
        },
      },
    });
    expect(endpoint.pathParams[0]!.required).toBe(true);
  });

  it('8: operation with no tags field has no tags key on endpoint', () => {
    const { endpoint } = parseEndpoint({
      '/notags': {
        get: {
          responses: {
            '200': {
              content: { 'application/json': { schema: { type: 'object', properties: {} } } },
            },
          },
        },
      },
    });
    expect('tags' in endpoint).toBe(false);
  });

  it('9: unsupported in: cookie pushes warning and skips parameter', () => {
    const { endpoint, warnings } = parseEndpoint({
      '/cookies': {
        get: {
          parameters: [
            { name: 'session', in: 'cookie', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              content: { 'application/json': { schema: { type: 'object', properties: {} } } },
            },
          },
        },
      },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/unsupported in: cookie/);
    expect(endpoint.pathParams).toHaveLength(0);
    expect(endpoint.queryParams).toHaveLength(0);
    expect(endpoint.headers).toHaveLength(0);
  });

  it('10: method is uppercased (get → GET)', () => {
    const { endpoint } = parseEndpoint({
      '/upper': {
        get: {
          responses: {
            '200': {
              content: { 'application/json': { schema: { type: 'object', properties: {} } } },
            },
          },
        },
      },
    });
    expect(endpoint.method).toBe('GET');
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('round-trip', () => {
  it('toOpenApi then fromOpenApi preserves type keys and info name', () => {
    const original = emptySpec('MyAPI');
    original.info.version = '2.0';
    original.info.baseUrl = 'https://example.com';
    original.types['User'] = {
      kind: 'object',
      fields: [
        { name: 'id', required: true, type: { kind: 'string' } },
        { name: 'age', required: false, type: { kind: 'integer' } },
      ],
    };
    original.types['Tag'] = {
      kind: 'object',
      fields: [{ name: 'label', required: true, type: { kind: 'string' } }],
    };

    const oas = toOpenApi(original);
    const { spec: imported, warnings } = fromOpenApi(oas);

    // No warnings about unsupported features
    expect(warnings).toHaveLength(0);

    // Type keys are preserved
    expect(Object.keys(imported.types).sort()).toEqual(['Tag', 'User']);

    // Info name round-trips
    expect(imported.info.name).toBe('MyAPI');

    // Endpoints stay empty (no paths in this spec)
    expect(imported.endpoints).toEqual([]);
  });

  it('round-trip import → export → import preserves endpoint extensions', () => {
    const original = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: {
            responses: { '200': { description: 'ok' } },
            'x-codeSamples': [{ lang: 'js', source: 'fetch("/x")' }],
            'x-internal': false,
          },
        },
      },
    };
    const { spec } = fromOpenApi(original);
    const roundTripped = toOpenApi(spec);
    const { spec: respec } = fromOpenApi(roundTripped);
    expect(respec.endpoints[0]!.extensions).toEqual(spec.endpoints[0]!.extensions);
  });
});

// ---------------------------------------------------------------------------
// File / multipart binary handling
// ---------------------------------------------------------------------------

describe('file uploads (multipart binary)', () => {
  it('imports a multipart bodyForm file field as FileType (preserving accept + maxBytes)', () => {
    const { spec, warnings } = fromOpenApi({
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/upload': {
          post: {
            requestBody: {
              required: true,
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      note: { type: 'string' },
                      attachment: {
                        type: 'string',
                        format: 'binary',
                        'x-zwaggen-accept': 'image/*',
                        'x-zwaggen-max-bytes': 1024,
                      },
                    },
                    required: ['note', 'attachment'],
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    expect(warnings).toEqual([]);
    const ep = spec.endpoints[0]!;
    expect(ep.bodyContentType).toBe('multipart');
    expect(ep.bodyForm).toEqual([
      { name: 'note', required: true, type: { kind: 'string' } },
      { name: 'attachment', required: true, type: { kind: 'file', accept: 'image/*', maxBytes: 1024 } },
    ]);
  });

  it('warns and falls back to plain string when format:binary appears outside multipart', () => {
    const { spec, warnings } = fromOpenApi({
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          post: {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { blob: { type: 'string', format: 'binary' } },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    expect(warnings.some((w) => /format: binary outside multipart\/form-data/.test(w))).toBe(true);
    const ep = spec.endpoints[0]!;
    const body = ep.requestBody as ObjectType;
    expect(body.kind).toBe('object');
    expect(body.fields[0]).toEqual({ name: 'blob', required: false, type: { kind: 'string' } });
  });

  it('round-trips a multipart bodyForm file field through export → import', () => {
    const original = emptySpec('Upload API');
    original.endpoints.push({
      id: 'upload', method: 'POST', path: '/upload',
      pathParams: [], queryParams: [], headers: [],
      requestBody: null,
      bodyContentType: 'multipart',
      bodyForm: [{ name: 'file', required: true, type: { kind: 'file' } }],
      responses: [], auth: 'inherit', useProxy: 'inherit',
    } as Endpoint);

    const oapi = toOpenApi(original);
    const { spec: back } = fromOpenApi(oapi);
    const ep = back.endpoints[0]!;
    expect(ep.bodyContentType).toBe('multipart');
    expect(ep.bodyForm).toEqual([{ name: 'file', required: true, type: { kind: 'file' } }]);
  });
});

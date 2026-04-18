import { describe, expect, it } from 'vitest';
import { fromOpenApi } from '../../src/importers/openapi';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec } from '../../src/schema/defaults';
import type { ObjectType } from '../../src/schema/types';

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

    // Endpoints stay empty (paths not imported in Task 1)
    expect(imported.endpoints).toEqual([]);
  });
});

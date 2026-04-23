import { describe, expect, test } from 'vitest';
import { migrate, MIGRATIONS } from '../../src/schema/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/schema/types';

const v1Sample = {
  schemaVersion: 1,
  info: { name: 'legacy' },
  types: { User: { kind: 'object', fields: [] } },
  environments: { default: { variables: [] } },
  activeEnvironment: 'default',
  auth: { type: 'none' },
  useProxyDefault: false,
  endpoints: [],
};

describe('migrate', () => {
  test('inputVersion === CURRENT_SCHEMA_VERSION is a no-op', () => {
    const atCurrent = { ...v1Sample, schemaVersion: CURRENT_SCHEMA_VERSION };
    const out = migrate(atCurrent, CURRENT_SCHEMA_VERSION);
    expect(out).toBe(atCurrent);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('v1 → current walks the chain, stamping the version', () => {
    const out = migrate(v1Sample, 1);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // Payload passes through unchanged (the v1→v2 migrator is just a version stamp).
    expect(out.types).toBe(v1Sample.types);
  });

  test('input version higher than current throws', () => {
    expect(() => migrate({ ...v1Sample, schemaVersion: 99 }, 99)).toThrow(/newer than this app supports/i);
  });

  test('input version with no migration path throws', () => {
    // 0 has no registered migration entry, so the walker has no `from: 0` to use.
    expect(() => migrate({}, 0)).toThrow(/no migration path from schemaVersion 0/i);
  });

  test('v2 → current is a no-op payload (version stamp only)', () => {
    const v2Sample = {
      schemaVersion: 2,
      info: { name: 'v2' },
      types: { User: { kind: 'object', fields: [] } },
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [],
    };
    const out = migrate(v2Sample, 2);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.types.User).toBe(v2Sample.types.User);
  });

  test('v1 → current walks the full chain (v1 → v2 → v3)', () => {
    const v1Sample = {
      schemaVersion: 1,
      info: { name: 'v1' },
      types: { User: { kind: 'object', fields: [] } },
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [],
    };
    const out = migrate(v1Sample, 1);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.types.User).toBeDefined();
  });

  test('v4 → current preserves bodyContentType + bodyForm absence and migrates empty query/headers to undefined', () => {
    const v4Sample = {
      schemaVersion: 4,
      info: { name: 'v4' },
      types: { User: { kind: 'object', fields: [] } },
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [
        {
          id: 'e1',
          method: 'POST',
          path: '/x',
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as any;
    const out = migrate(v4Sample, 4);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.endpoints[0]!.bodyContentType).toBeUndefined();
    expect(out.endpoints[0]!.bodyForm).toBeUndefined();
    // Empty v4 query/header arrays migrate to undefined under v7.
    expect(out.endpoints[0]!.queryParams).toBeUndefined();
    expect(out.endpoints[0]!.headers).toBeUndefined();
  });

  test('v5 → current preserves bodyForm and migrates empty query/headers to undefined', () => {
    const v5Sample = {
      schemaVersion: 5,
      info: { name: 'v5' },
      types: { User: { kind: 'object', fields: [] } },
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [
        {
          id: 'e1',
          method: 'POST',
          path: '/x',
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: null,
          bodyContentType: 'multipart',
          bodyForm: [{ name: 'note', required: true, type: { kind: 'string' } }],
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as any;
    const out = migrate(v5Sample, 5);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.endpoints[0]!.bodyContentType).toBe('multipart');
    expect(out.endpoints[0]!.bodyForm).toEqual([
      { name: 'note', required: true, type: { kind: 'string' } },
    ]);
    expect(out.endpoints[0]!.queryParams).toBeUndefined();
    expect(out.endpoints[0]!.headers).toBeUndefined();
  });

  test('v6 → current wraps non-empty query/header ParamDef[] into inline ObjectType', () => {
    const v6Sample = {
      schemaVersion: 6,
      info: { name: 'v6' },
      types: {},
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [
        {
          id: 'e',
          method: 'GET',
          path: '/x',
          pathParams: [],
          queryParams: [
            { name: 'page', required: true, type: { kind: 'integer' } },
            { name: 'limit', required: false, type: { kind: 'integer' }, description: 'page size' },
          ],
          headers: [{ name: 'X-Trace', required: false, type: { kind: 'string' } }],
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as any;
    const out = migrate(v6Sample, 6);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.endpoints[0]!.queryParams).toEqual({
      kind: 'object',
      fields: [
        { name: 'page', required: true, type: { kind: 'integer' } },
        { name: 'limit', required: false, type: { kind: 'integer' }, description: 'page size' },
      ],
    });
    expect(out.endpoints[0]!.headers).toEqual({
      kind: 'object',
      fields: [{ name: 'X-Trace', required: false, type: { kind: 'string' } }],
    });
  });

  test('v6 endpoint with empty query/header arrays migrates to undefined', () => {
    const v6Sample = {
      schemaVersion: 6,
      info: { name: 'v6' },
      types: {},
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [
        {
          id: 'e',
          method: 'GET',
          path: '/x',
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as any;
    const out = migrate(v6Sample, 6);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.endpoints[0]!.queryParams).toBeUndefined();
    expect(out.endpoints[0]!.headers).toBeUndefined();
    // queryParams/headers keys should be absent, not present-with-undefined
    expect('queryParams' in out.endpoints[0]!).toBe(false);
    expect('headers' in out.endpoints[0]!).toBe(false);
  });

  test('v6 description on ParamDef migrates to ObjectField description', () => {
    const v6Sample = {
      schemaVersion: 6,
      info: { name: 'v6' },
      types: {},
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [
        {
          id: 'e',
          method: 'GET',
          path: '/x',
          pathParams: [],
          queryParams: [
            { name: 'q', required: true, type: { kind: 'string' }, description: 'search term' },
          ],
          headers: [],
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    } as any;
    const out = migrate(v6Sample, 6);
    const field = (out.endpoints[0]!.queryParams as any).fields[0];
    expect(field.description).toBe('search term');
    // Field with no description should have no description key (not undefined).
    const v6NoDesc = {
      ...v6Sample,
      endpoints: [{
        ...v6Sample.endpoints[0],
        queryParams: [{ name: 'q', required: true, type: { kind: 'string' } }],
      }],
    };
    const out2 = migrate(v6NoDesc, 6);
    const field2 = (out2.endpoints[0]!.queryParams as any).fields[0];
    expect('description' in field2).toBe(false);
  });

  test('MIGRATIONS is a contiguous chain starting at 1 ending at CURRENT_SCHEMA_VERSION', () => {
    expect(MIGRATIONS.length).toBe(CURRENT_SCHEMA_VERSION - 1);
    MIGRATIONS.forEach((m, i) => {
      expect(m.from).toBe(i + 1);
      expect(m.to).toBe(i + 2);
    });
  });
});

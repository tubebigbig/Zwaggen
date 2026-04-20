import { describe, expect, it, test } from 'vitest';
import { emptySpec } from '../../src/schema/defaults';
import { fromJSON, toJSON, SpecVersionError } from '../../src/schema/serialize';
import { CURRENT_SCHEMA_VERSION } from '../../src/schema/types';

describe('spec serialization', () => {
  test('round-trips an empty spec', () => {
    const s = emptySpec();
    const j = toJSON(s);
    const back = fromJSON(JSON.parse(j));
    expect(back).toEqual(s);
  });

  test('rejects missing schemaVersion', () => {
    expect(() => fromJSON({ info: { name: 'x' } })).toThrow(SpecVersionError);
  });

  test('rejects a higher schemaVersion', () => {
    expect(() => fromJSON({ schemaVersion: 999, info: { name: 'x' } })).toThrow(SpecVersionError);
  });

  test('silently upgrades schemaVersion 1 → current', () => {
    const v1 = {
      schemaVersion: 1,
      info: { name: 'old' },
      types: {},
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [],
    };
    const parsed = fromJSON(v1);
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.info.name).toBe('old');
  });

  test('sorts object keys stably', () => {
    const s = emptySpec('B');
    const j = toJSON(s);
    // key order deterministic: schemaVersion first
    expect(j.indexOf('"schemaVersion"')).toBeLessThan(j.indexOf('"info"'));
  });

  it('round-trips info.baseUrl', () => {
    const s = emptySpec();
    s.info.baseUrl = 'https://api.example.com';
    const parsed = fromJSON(JSON.parse(toJSON(s)));
    expect(parsed.info.baseUrl).toBe('https://api.example.com');
  });

  it('omits info.baseUrl key when undefined', () => {
    const s = emptySpec();
    const text = toJSON(s);
    expect(text).not.toContain('"baseUrl"');
  });

  it('round-trips example on object type', () => {
    const s = emptySpec();
    s.types['User'] = { kind: 'object', fields: [], example: { id: 'u_1', name: 'Alice' } };
    const parsed = fromJSON(JSON.parse(toJSON(s)));
    expect(parsed.types['User']).toEqual(s.types['User']);
  });

  it('omits example key when undefined', () => {
    const s = emptySpec();
    s.types['User'] = { kind: 'object', fields: [] };
    const text = toJSON(s);
    expect(text).not.toContain('"example"');
  });

  it('round-trips endpoint.assertions', () => {
    const s = emptySpec();
    s.endpoints.push({
      id: 'e1', method: 'POST', path: '/x',
      pathParams: [], queryParams: [], headers: [],
      requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
      assertions: {
        expectedStatus: 200,
        maxLatencyMs: 500,
        requiredHeaders: [{ name: 'content-type', value: 'application/json' }],
      },
    });
    const parsed = fromJSON(JSON.parse(toJSON(s)));
    expect(parsed.endpoints[0]!.assertions).toEqual(s.endpoints[0]!.assertions);
  });

  it('omits assertions key when undefined', () => {
    const s = emptySpec();
    s.endpoints.push({
      id: 'e1', method: 'GET', path: '/x',
      pathParams: [], queryParams: [], headers: [],
      requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
    });
    expect(toJSON(s)).not.toContain('"assertions"');
  });

  it('round-trips endpoint.captures', () => {
    const s = emptySpec();
    s.endpoints.push({
      id: 'e1', method: 'POST', path: '/login',
      pathParams: [], queryParams: [], headers: [],
      requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
      captures: [{ path: 'token', setVar: 'authToken', envName: 'prod' }],
    });
    const parsed = fromJSON(JSON.parse(toJSON(s)));
    expect(parsed.endpoints[0]!.captures).toEqual(s.endpoints[0]!.captures);
  });

  it('omits captures key when undefined', () => {
    const s = emptySpec();
    s.endpoints.push({
      id: 'e1', method: 'GET', path: '/x',
      pathParams: [], queryParams: [], headers: [],
      requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
    });
    expect(toJSON(s)).not.toContain('"captures"');
  });

  test('rejects a string schemaVersion with a helpful message', () => {
    expect(() => fromJSON({ schemaVersion: '1', info: { name: 'x' } })).toThrow(
      /schemaVersion must be a number/i,
    );
  });

  test('rejects a non-integer schemaVersion', () => {
    expect(() => fromJSON({ schemaVersion: 1.5, info: { name: 'x' } })).toThrow(SpecVersionError);
  });

  test('rejects a negative schemaVersion', () => {
    expect(() => fromJSON({ schemaVersion: -1, info: { name: 'x' } })).toThrow(SpecVersionError);
  });

  test('rejects a future schemaVersion with a clear message', () => {
    expect(() => fromJSON({ schemaVersion: 999, info: { name: 'x' } })).toThrow(
      /does not support/i,
    );
  });
});

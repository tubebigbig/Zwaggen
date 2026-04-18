import { describe, expect, test } from 'vitest';
import { emptySpec } from '../../src/schema/defaults';
import { fromJSON, toJSON, SpecVersionError } from '../../src/schema/serialize';

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
});

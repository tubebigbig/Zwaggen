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
});

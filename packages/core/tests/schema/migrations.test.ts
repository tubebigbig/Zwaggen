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

  test('MIGRATIONS is a contiguous chain starting at 1 ending at CURRENT_SCHEMA_VERSION', () => {
    expect(MIGRATIONS.length).toBe(CURRENT_SCHEMA_VERSION - 1);
    MIGRATIONS.forEach((m, i) => {
      expect(m.from).toBe(i + 1);
      expect(m.to).toBe(i + 2);
    });
  });
});

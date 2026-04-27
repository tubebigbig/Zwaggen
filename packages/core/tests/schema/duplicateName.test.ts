import { describe, it, expect } from 'vitest';
import { emptySpec, nextAvailableTypeName } from '../../src';

describe('nextAvailableTypeName', () => {
  it('returns Copy when base+Copy is free', () => {
    const s = emptySpec();
    s.types['User'] = { kind: 'object', fields: [] };
    expect(nextAvailableTypeName(s, 'User')).toBe('UserCopy');
  });

  it('cascades to Copy2, Copy3 on collisions', () => {
    const s = emptySpec();
    s.types['User'] = { kind: 'object', fields: [] };
    s.types['UserCopy'] = { kind: 'object', fields: [] };
    s.types['UserCopy2'] = { kind: 'object', fields: [] };
    expect(nextAvailableTypeName(s, 'User')).toBe('UserCopy3');
  });

  it('respects folder scope', () => {
    const s = emptySpec();
    s.types['auth/User'] = { kind: 'object', fields: [] };
    expect(nextAvailableTypeName(s, 'User', 'auth')).toBe('UserCopy');
    s.types['auth/UserCopy'] = { kind: 'object', fields: [] };
    expect(nextAvailableTypeName(s, 'User', 'auth')).toBe('UserCopy2');
    expect(nextAvailableTypeName(s, 'User', 'public')).toBe('UserCopy');
  });
});

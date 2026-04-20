import { expect, test, describe } from 'vitest';
import {
  normalizeFolder,
  isValidSegment,
  splitKey,
  joinKey,
  childOf,
} from '../../src/schema/folders';

describe('normalizeFolder', () => {
  test('trims, collapses //, strips leading and trailing /', () => {
    expect(normalizeFolder('  /auth//admin/  ')).toBe('auth/admin');
  });

  test('empty / whitespace / single slash → undefined', () => {
    expect(normalizeFolder('')).toBeUndefined();
    expect(normalizeFolder('   ')).toBeUndefined();
    expect(normalizeFolder('/')).toBeUndefined();
    expect(normalizeFolder('///')).toBeUndefined();
  });

  test('preserves mixed-case and allowed punctuation', () => {
    expect(normalizeFolder('Auth.v1/admin-tools')).toBe('Auth.v1/admin-tools');
  });

  test('rejects a segment with disallowed chars by returning null', () => {
    expect(normalizeFolder('auth/bad?segment')).toBeNull();
    expect(normalizeFolder('auth/bad\\seg')).toBeNull();
  });
});

describe('isValidSegment', () => {
  test('accepts letters, digits, underscore, dot, dash, space', () => {
    expect(isValidSegment('Hello_World.v2-beta 1')).toBe(true);
  });
  test('rejects slashes and other punctuation', () => {
    expect(isValidSegment('a/b')).toBe(false);
    expect(isValidSegment('a?b')).toBe(false);
    expect(isValidSegment('')).toBe(false);
  });
});

describe('splitKey / joinKey', () => {
  test('splitKey("auth/admin/User") → { folder: "auth/admin", name: "User" }', () => {
    expect(splitKey('auth/admin/User')).toEqual({ folder: 'auth/admin', name: 'User' });
  });

  test('splitKey("User") → { folder: undefined, name: "User" }', () => {
    expect(splitKey('User')).toEqual({ folder: undefined, name: 'User' });
  });

  test('joinKey respects undefined folder', () => {
    expect(joinKey(undefined, 'User')).toBe('User');
    expect(joinKey('', 'User')).toBe('User');
    expect(joinKey('auth', 'User')).toBe('auth/User');
    expect(joinKey('auth/admin', 'User')).toBe('auth/admin/User');
  });
});

describe('childOf', () => {
  test('recognizes direct and deep children of a folder prefix', () => {
    expect(childOf('auth/User', 'auth')).toBe(true);
    expect(childOf('auth/admin/User', 'auth')).toBe(true);
  });
  test('does not confuse prefixes that share a segment boundary', () => {
    expect(childOf('authority/User', 'auth')).toBe(false);
    expect(childOf('User', 'auth')).toBe(false);
  });
});

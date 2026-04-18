import { describe, expect, it } from 'vitest';
import { extractByPath, parsePath } from '../../src/runner/path';

describe('parsePath', () => {
  it('returns null for empty string', () => {
    expect(parsePath('')).toBeNull();
  });

  it('returns null for malformed bracket [abc]', () => {
    expect(parsePath('[abc]')).toBeNull();
  });

  it('returns null for unterminated bracket', () => {
    expect(parsePath('a[')).toBeNull();
  });

  it('parses a simple key', () => {
    expect(parsePath('a')).toEqual(['a']);
  });

  it('parses a dotted path', () => {
    expect(parsePath('a.b')).toEqual(['a', 'b']);
  });

  it('parses a bracket index', () => {
    expect(parsePath('[0]')).toEqual([0]);
  });

  it('parses mixed path a[1].b', () => {
    expect(parsePath('a[1].b')).toEqual(['a', 1, 'b']);
  });
});

describe('extractByPath', () => {
  it('1: simple key', () => {
    expect(extractByPath({ a: 1 }, 'a')).toEqual({ value: 1, found: true });
  });

  it('2: nested dot path', () => {
    expect(extractByPath({ a: { b: 'x' } }, 'a.b')).toEqual({ value: 'x', found: true });
  });

  it('3: array index via bracket notation in mixed path', () => {
    expect(extractByPath({ users: [{ id: 1 }, { id: 2 }] }, 'users[1].id')).toEqual({ value: 2, found: true });
  });

  it('4: array root with bracket index', () => {
    expect(extractByPath([1, 2, 3], '[2]')).toEqual({ value: 3, found: true });
  });

  it('5: missing key returns found: false', () => {
    const result = extractByPath({}, 'missing');
    expect(result.found).toBe(false);
  });

  it('6: null root returns found: false', () => {
    const result = extractByPath(null, 'a');
    expect(result.found).toBe(false);
  });

  it('7: malformed path [abc] returns found: false', () => {
    const result = extractByPath({ a: 1 }, '[abc]');
    expect(result.found).toBe(false);
  });

  it('8: empty path returns found: false', () => {
    const result = extractByPath({ a: 1 }, '');
    expect(result.found).toBe(false);
  });

  it('9: null leaf value — found: true, value: null', () => {
    expect(extractByPath({ a: null }, 'a')).toEqual({ value: null, found: true });
  });

  it('10: undefined leaf value — found: true (key exists)', () => {
    expect(extractByPath({ a: undefined }, 'a')).toEqual({ value: undefined, found: true });
  });

  it('11: missing nested key returns found: false', () => {
    const result = extractByPath({ a: { b: 1 } }, 'a.c');
    expect(result.found).toBe(false);
  });

  it('12: out-of-bounds index returns found: false', () => {
    const result = extractByPath({ a: [1, 2, 3] }, 'a[10]');
    expect(result.found).toBe(false);
  });

  it('13: unterminated bracket returns found: false', () => {
    const result = extractByPath({ a: 1 }, 'a[');
    expect(result.found).toBe(false);
  });

  it('14: array index on a non-array returns found: false', () => {
    const result = extractByPath({ a: 'str' }, 'a[0]');
    expect(result.found).toBe(false);
  });
});

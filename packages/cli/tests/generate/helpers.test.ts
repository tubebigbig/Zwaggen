import { describe, it, expect } from 'vitest';
import { safeIdentifier, tagForEndpoint, pathParamNames } from '../../src/generate/helpers.js';

describe('safeIdentifier', () => {
  it('passes through plain identifiers', () => {
    expect(safeIdentifier('userId')).toBe('userId');
    expect(safeIdentifier('User')).toBe('User');
  });

  it('quotes TS reserved words', () => {
    expect(safeIdentifier('class')).toBe("'class'");
    expect(safeIdentifier('return')).toBe("'return'");
    expect(safeIdentifier('new')).toBe("'new'");
  });

  it('quotes identifiers starting with digits', () => {
    expect(safeIdentifier('1stPlace')).toBe("'1stPlace'");
  });

  it('quotes identifiers with special chars', () => {
    expect(safeIdentifier('foo-bar')).toBe("'foo-bar'");
    expect(safeIdentifier('foo.bar')).toBe("'foo.bar'");
  });
});

describe('tagForEndpoint', () => {
  it('returns endpoint tag if present', () => {
    expect(tagForEndpoint({ tag: 'users' } as any)).toBe('users');
  });

  it("returns 'default' when tag missing", () => {
    expect(tagForEndpoint({} as any)).toBe('default');
  });

  it("returns 'default' when tag is empty string", () => {
    expect(tagForEndpoint({ tag: '' } as any)).toBe('default');
  });
});

describe('pathParamNames', () => {
  it('extracts single param', () => {
    expect(pathParamNames('/users/{id}')).toEqual(['id']);
  });

  it('extracts multiple params', () => {
    expect(pathParamNames('/users/{userId}/posts/{postId}')).toEqual(['userId', 'postId']);
  });

  it('returns empty for paths without params', () => {
    expect(pathParamNames('/users')).toEqual([]);
  });
});

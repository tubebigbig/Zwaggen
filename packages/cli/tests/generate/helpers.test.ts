import { describe, it, expect } from 'vitest';
import {
  safeIdentifier,
  tagForEndpoint,
  pathParamNames,
  sanitizeFolderKey,
} from '../../src/generate/helpers.js';

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

describe('sanitizeFolderKey', () => {
  it('passes plain identifiers through unchanged', () => {
    expect(sanitizeFolderKey('User')).toBe('User');
    expect(sanitizeFolderKey('Status')).toBe('Status');
  });

  it('replaces a single slash with underscore', () => {
    expect(sanitizeFolderKey('auth/User')).toBe('auth_User');
  });

  it('replaces multiple slashes with underscores', () => {
    expect(sanitizeFolderKey('billing/v2/Invoice')).toBe('billing_v2_Invoice');
  });
});


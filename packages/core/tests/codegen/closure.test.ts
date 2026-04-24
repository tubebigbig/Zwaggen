import { describe, it, expect } from 'vitest';
import { emptySpec, type Spec, type ObjectType, type RefType } from '../../src';
import { resolveSlice, folderMatchesPrefix } from '../../src/codegen/closure';

function specFixture(): Spec {
  const s = emptySpec();
  // Three types: User (refs Address), Address, Company (unrelated)
  s.types['User'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'address', required: false, type: { kind: 'ref', ref: 'Address' } },
    ],
  };
  s.types['Address'] = {
    kind: 'object',
    fields: [
      { name: 'street', required: true, type: { kind: 'string' } },
    ],
  };
  s.types['Company'] = {
    kind: 'object',
    fields: [{ name: 'name', required: true, type: { kind: 'string' } }],
  };
  s.endpoints = [
    {
      id: 'getUser',
      method: 'GET',
      path: '/users/:id',
      pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } as RefType }],
      auth: 'inherit',
      useProxy: 'inherit',
    },
    {
      id: 'getCompany',
      method: 'GET',
      path: '/companies',
      pathParams: [],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'Company' } as RefType }],
      auth: 'inherit',
      useProxy: 'inherit',
    },
  ];
  return s;
}

function typeKeysOf(spec: Spec, types: readonly unknown[]): Set<string> {
  // Resolve back to keys by reference identity
  const out = new Set<string>();
  for (const [k, t] of Object.entries(spec.types)) {
    if (types.includes(t)) out.add(k);
  }
  return out;
}

describe('resolveSlice', () => {
  it('returns full spec when slice is undefined', () => {
    const spec = specFixture();
    const r = resolveSlice(spec);
    expect(r.endpoints).toHaveLength(2);
    expect(r.types).toHaveLength(3);
    expect(r.unresolvedRefs).toEqual([]);
  });

  it('endpointIds pulls only those endpoints + their type closure', () => {
    const spec = specFixture();
    const r = resolveSlice(spec, { endpointIds: ['getUser'] });
    expect(r.endpoints.map((e) => e.id)).toEqual(['getUser']);
    expect(typeKeysOf(spec, r.types)).toEqual(new Set(['User', 'Address']));
    expect(r.unresolvedRefs).toEqual([]);
  });

  it('typeKeys pulls only those types + transitive refs', () => {
    const spec = specFixture();
    const r = resolveSlice(spec, { typeKeys: ['User'] });
    expect(r.endpoints).toEqual([]);
    expect(typeKeysOf(spec, r.types)).toEqual(new Set(['User', 'Address']));
  });

  it('typeKeys pulls extends parents transitively', () => {
    const spec = specFixture();
    spec.types['Admin'] = {
      kind: 'object',
      extends: ['User'],
      fields: [{ name: 'role', required: true, type: { kind: 'string' } }],
    };
    const r = resolveSlice(spec, { typeKeys: ['Admin'] });
    expect(typeKeysOf(spec, r.types)).toEqual(new Set(['Admin', 'User', 'Address']));
  });

  it('folderPrefix matches folder and subfolders, not unrelated names', () => {
    const spec = specFixture();
    spec.types['auth/Token'] = { kind: 'object', fields: [] };
    spec.types['auth/oauth/Code'] = { kind: 'object', fields: [] };
    spec.types['authentication/Session'] = { kind: 'object', fields: [] };
    const r = resolveSlice(spec, { folderPrefix: 'auth' });
    expect(typeKeysOf(spec, r.types)).toEqual(new Set(['auth/Token', 'auth/oauth/Code']));
  });

  it('combines endpointIds + typeKeys as a union', () => {
    const spec = specFixture();
    const r = resolveSlice(spec, {
      endpointIds: ['getCompany'],
      typeKeys: ['User'],
    });
    expect(r.endpoints.map((e) => e.id)).toEqual(['getCompany']);
    // Closure pulls User+Address from typeKeys; Company from getCompany's response ref
    expect(typeKeysOf(spec, r.types)).toEqual(new Set(['User', 'Address', 'Company']));
  });

  it('unresolved refs surface in unresolvedRefs', () => {
    const spec = specFixture();
    spec.endpoints[0]!.responses = [
      { status: 200, type: { kind: 'ref', ref: 'NotARealType' } as RefType },
    ];
    const r = resolveSlice(spec, { endpointIds: ['getUser'] });
    expect(r.unresolvedRefs).toEqual(['NotARealType']);
  });

  it('preserves spec.endpoints ordering for filtered results', () => {
    const spec = specFixture();
    const r = resolveSlice(spec, { endpointIds: ['getCompany', 'getUser'] });
    // Spec order is getUser first, getCompany second — preserved regardless of input order
    expect(r.endpoints.map((e) => e.id)).toEqual(['getUser', 'getCompany']);
  });

  it('typeKeys is parallel-indexed with types', () => {
    const spec = specFixture();
    const r = resolveSlice(spec);
    expect(r.typeKeys).toHaveLength(r.types.length);
    for (let i = 0; i < r.types.length; i++) {
      expect(spec.types[r.typeKeys[i]!]).toBe(r.types[i]);
    }
  });
});

describe('folderMatchesPrefix', () => {
  // Empty prefix means "root only" (items with no folder), not "match all".
  // Slice 2's export buttons always pass non-empty prefixes — this locks
  // down the documented edge case.
  it('empty prefix matches only items with no folder', () => {
    expect(folderMatchesPrefix(undefined, '')).toBe(true);
    expect(folderMatchesPrefix('auth', '')).toBe(false);
    expect(folderMatchesPrefix('auth/oauth', '')).toBe(false);
  });

  it('matches at any folder depth via segment boundary', () => {
    expect(folderMatchesPrefix('a/b/c/Foo', 'a')).toBe(true);
    expect(folderMatchesPrefix('a/b/c/Foo', 'a/b')).toBe(true);
    expect(folderMatchesPrefix('a/b/c/Foo', 'a/b/c/Foo')).toBe(true);
    expect(folderMatchesPrefix('a/b/c/Foo', 'a/b/c/Foo/extra')).toBe(false);
  });
});

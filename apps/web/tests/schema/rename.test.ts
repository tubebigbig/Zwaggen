import { expect, test } from 'vitest';
import { renameType, collectBrokenRefs, renameFolder } from '../../src/schema/rename';
import { emptySpec } from '../../src/schema/defaults';

test('renames a type and updates refs deeply', () => {
  const spec = emptySpec();
  spec.types.User = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/u', pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const next = renameType(spec, 'User', 'Account');
  expect(next.types.Account).toBeDefined();
  expect(next.types.User).toBeUndefined();
  expect(next.endpoints[0]!.responses[0]!.type).toEqual({ kind: 'ref', ref: 'Account' });
});

test('collectBrokenRefs finds dangling references', () => {
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/x', pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'ref', ref: 'Missing' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  expect(collectBrokenRefs(spec)).toEqual([
    { location: 'endpoint:e1:requestBody', ref: 'Missing' },
  ]);
});

test('renameFolder rewrites every descendant type key and ref', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  spec.types['auth/admin/Session'] = {
    kind: 'object',
    fields: [{ name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } }],
  };
  spec.types['other/Order'] = { kind: 'object', fields: [] };
  spec.endpoints.push({
    id: 'e1', method: 'POST', path: '/login', pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'ref', ref: 'auth/User' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });

  const next = renameFolder(spec, 'auth', 'identity');

  expect(next.types['identity/User']).toBeDefined();
  expect(next.types['identity/admin/Session']).toBeDefined();
  expect(next.types['auth/User']).toBeUndefined();
  expect(next.types['auth/admin/Session']).toBeUndefined();
  expect(next.types['other/Order']).toBeDefined();

  // refs updated
  const session = next.types['identity/admin/Session'] as { kind: 'object'; fields: Array<{ type: { kind: string; ref?: string } }> };
  expect(session.fields[0]!.type).toEqual({ kind: 'ref', ref: 'identity/User' });
  expect(next.endpoints[0]!.requestBody).toEqual({ kind: 'ref', ref: 'identity/User' });
});

test('renameFolder rewrites endpoint.folder on every matching endpoint', () => {
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'a', method: 'GET', path: '/a', folder: 'users/admin',
    pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  spec.endpoints.push({
    id: 'b', method: 'GET', path: '/b', folder: 'users',
    pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  spec.endpoints.push({
    id: 'c', method: 'GET', path: '/c', folder: 'other',
    pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  const next = renameFolder(spec, 'users', 'members');
  expect(next.endpoints[0]!.folder).toBe('members/admin');
  expect(next.endpoints[1]!.folder).toBe('members');
  expect(next.endpoints[2]!.folder).toBe('other');
});

test('renameFolder is a no-op when no items match', () => {
  const spec = emptySpec();
  spec.types.User = { kind: 'object', fields: [] };
  const next = renameFolder(spec, 'missing', 'new');
  expect(next).toEqual(spec);
});

test('renameFolder handles overlapping prefix (auth → authv2) without losing keys', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['auth/admin/Session'] = {
    kind: 'object',
    fields: [{ name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } }],
  };
  const next = renameFolder(spec, 'auth', 'authv2');
  expect(next.types['authv2/User']).toBeDefined();
  expect(next.types['authv2/admin/Session']).toBeDefined();
  expect(next.types['auth/User']).toBeUndefined();
  expect(next.types['auth/admin/Session']).toBeUndefined();
  const session = next.types['authv2/admin/Session'] as { kind: 'object'; fields: Array<{ type: { ref?: string } }> };
  expect(session.fields[0]!.type.ref).toBe('authv2/User');
});

test('renameFolder handles destination nested inside source (x → x/y) via leaves-first ordering', () => {
  const spec = emptySpec();
  spec.types['x/a'] = { kind: 'object', fields: [] };
  spec.types['x/a/b'] = { kind: 'object', fields: [] };
  const next = renameFolder(spec, 'x', 'x/y');
  expect(next.types['x/y/a']).toBeDefined();
  expect(next.types['x/y/a/b']).toBeDefined();
  expect(next.types['x/a']).toBeUndefined();
  expect(next.types['x/a/b']).toBeUndefined();
});

test('renameFolder with empty newFolder moves everything to root (types + endpoints)', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['auth/admin/Session'] = {
    kind: 'object',
    fields: [{ name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } }],
  };
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/me', folder: 'auth',
    pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  spec.endpoints.push({
    id: 'e2', method: 'GET', path: '/session', folder: 'auth/admin',
    pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });

  const next = renameFolder(spec, 'auth', '');

  expect(next.types['User']).toBeDefined();
  expect(next.types['admin/Session']).toBeDefined();
  expect(next.types['auth/User']).toBeUndefined();
  expect(next.types['auth/admin/Session']).toBeUndefined();
  const session = next.types['admin/Session'] as { kind: 'object'; fields: Array<{ type: { ref?: string } }> };
  expect(session.fields[0]!.type.ref).toBe('User');

  // First endpoint moves to root — folder field should be absent, not empty-string.
  expect(next.endpoints[0]!.folder).toBeUndefined();
  expect('folder' in next.endpoints[0]!).toBe(false);
  // Second endpoint moves to 'admin'.
  expect(next.endpoints[1]!.folder).toBe('admin');
});

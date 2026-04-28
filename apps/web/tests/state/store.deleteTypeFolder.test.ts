import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type RefType } from '@zwaggen/core';

beforeEach(async () => {
  const s = emptySpec();
  s.types['auth/User'] = { kind: 'object', fields: [] };
  s.types['auth/Token'] = {
    kind: 'object',
    fields: [{ name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } as RefType }],
  };
  s.types['public/Address'] = { kind: 'object', fields: [] };
  await useSpecStore.getState().replaceSpec(s, null);
});

test('deleteTypeFolder removes all types under prefix when no outside refs', async () => {
  const r = await useSpecStore.getState().deleteTypeFolder('auth');
  expect(r.ok).toBe(true);
  expect(Object.keys(useSpecStore.getState().spec.types)).toEqual(['public/Address']);
});

test('deleteTypeFolder returns inUse when an outside type references a folder type', async () => {
  // Add an outside type that references auth/User
  const s = useSpecStore.getState().spec;
  const next = {
    ...s,
    types: {
      ...s.types,
      OutsideRef: {
        kind: 'object' as const,
        fields: [
          { name: 'u', required: true, type: { kind: 'ref' as const, ref: 'auth/User' } as RefType },
        ],
      },
    },
  };
  await useSpecStore.getState().setSpec(next);

  const r = await useSpecStore.getState().deleteTypeFolder('auth');
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.reason).toBe('inUse');
    expect(r.usedBy).toContain('type OutsideRef');
  }
  // No mutation
  expect(useSpecStore.getState().spec.types['auth/User']).toBeDefined();
});

test('internal cross-refs within the deleted folder do not block deletion', async () => {
  // The fixture has auth/Token referencing auth/User — both internal — should still delete OK.
  const r = await useSpecStore.getState().deleteTypeFolder('auth');
  expect(r.ok).toBe(true);
});

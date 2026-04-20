import { expect, it, describe } from 'vitest';
import { diffSpecs } from '../../src/schema/diff';
import { emptySpec } from '../../src/schema/defaults';
import type { TypeDef } from '../../src/schema/types';

function mkSpec(types: Record<string, TypeDef> = {}) {
  return { ...emptySpec(), types };
}

const strType: TypeDef = { kind: 'string' };
const intType: TypeDef = { kind: 'integer' };

describe('diffSpecs — types', () => {
  it('1. identical specs (empty types) → no changes', () => {
    const result = diffSpecs(mkSpec(), mkSpec());
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toEqual([]);
  });

  it('2. type added in b → nonBreaking type.added', () => {
    const a = mkSpec();
    const b = mkSpec({ Foo: strType });
    const result = diffSpecs(a, b);
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('type.added');
    expect(result.nonBreaking[0]!.location).toBe('types:Foo');
  });

  it('3. type removed but unreferenced → nonBreaking type.removed', () => {
    const a = mkSpec({ Unused: strType });
    const b = mkSpec();
    const result = diffSpecs(a, b);
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('type.removed');
    expect(result.nonBreaking[0]!.location).toBe('types:Unused');
    expect(result.nonBreaking[0]!.summary).toContain('Unreferenced');
  });

  it('4. type removed AND referenced by endpoint response → breaking type.removed', () => {
    const sharedEndpoint = {
      id: 'ep1',
      method: 'GET' as const,
      path: '/things',
      pathParams: [],
      queryParams: [],
      headers: [],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref' as const, ref: 'MyModel' } }],
      auth: 'inherit' as const,
      useProxy: 'inherit' as const,
    };
    // Both specs share the same endpoint so no endpoint.removed is emitted.
    // Spec a has MyModel in types, spec b does not — removal is breaking because endpoint refs it.
    const specA = { ...mkSpec({ MyModel: strType }), endpoints: [sharedEndpoint] };
    const specB = { ...mkSpec(), endpoints: [sharedEndpoint] };
    const result = diffSpecs(specA, specB);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('type.removed');
    expect(result.breaking[0]!.summary).toContain('Referenced');
  });

  it('5. type kind changed (object → union) → breaking type.kind.changed', () => {
    const a = mkSpec({ Foo: { kind: 'object', fields: [] } });
    const b = mkSpec({ Foo: { kind: 'union', variants: [strType, intType] } });
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('type.kind.changed');
    expect(result.breaking[0]!.location).toBe('types:Foo');
  });

  it('6. object field removed → breaking type.field.removed', () => {
    const a = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: true, type: strType }] },
    });
    const b = mkSpec({ Foo: { kind: 'object', fields: [] } });
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('type.field.removed');
    expect(result.breaking[0]!.location).toBe('types:Foo.bar');
  });

  it('7. object field added required → breaking type.field.added.required', () => {
    const a = mkSpec({ Foo: { kind: 'object', fields: [] } });
    const b = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: true, type: strType }] },
    });
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('type.field.added.required');
    expect(result.breaking[0]!.location).toBe('types:Foo.bar');
  });

  it('8. object field added optional → nonBreaking type.field.added.optional', () => {
    const a = mkSpec({ Foo: { kind: 'object', fields: [] } });
    const b = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: false, type: strType }] },
    });
    const result = diffSpecs(a, b);
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('type.field.added.optional');
    expect(result.nonBreaking[0]!.location).toBe('types:Foo.bar');
  });

  it('9. field required flipped false→true → breaking type.field.required-flipped-to-true', () => {
    const a = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: false, type: strType }] },
    });
    const b = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: true, type: strType }] },
    });
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('type.field.required-flipped-to-true');
    expect(result.breaking[0]!.location).toBe('types:Foo.bar');
  });

  it('10. field required flipped true→false → nonBreaking type.field.required-flipped-to-false', () => {
    const a = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: true, type: strType }] },
    });
    const b = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: false, type: strType }] },
    });
    const result = diffSpecs(a, b);
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('type.field.required-flipped-to-false');
    expect(result.nonBreaking[0]!.location).toBe('types:Foo.bar');
  });

  it('11. field type changed → breaking type.field.type.changed', () => {
    const a = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: true, type: strType }] },
    });
    const b = mkSpec({
      Foo: { kind: 'object', fields: [{ name: 'bar', required: true, type: intType }] },
    });
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('type.field.type.changed');
    expect(result.breaking[0]!.location).toBe('types:Foo.bar');
  });

  it('12. non-object type (string) changed constraints → breaking type.changed', () => {
    const a = mkSpec({ Foo: { kind: 'string', minLength: 1 } });
    const b = mkSpec({ Foo: { kind: 'string', minLength: 5 } });
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('type.changed');
    expect(result.breaking[0]!.location).toBe('types:Foo');
  });

  it('refactor flat → extends with identical effective shape produces no diff', () => {
    // Spec A: flat User with two fields.
    const specA = mkSpec({
      User: {
        kind: 'object',
        fields: [
          { name: 'id', required: true, type: strType },
          { name: 'name', required: true, type: strType },
        ],
      },
    });
    // Spec B: User extends Base; id moves to Base, name stays on User.
    const specB = mkSpec({
      Base: {
        kind: 'object',
        fields: [{ name: 'id', required: true, type: strType }],
      },
      User: {
        kind: 'object',
        extends: ['Base'],
        fields: [{ name: 'name', required: true, type: strType }],
      },
    });

    const result = diffSpecs(specA, specB);
    // User's effective shape is identical; Base is newly introduced (nonBreaking add).
    const kinds = [...result.breaking, ...result.nonBreaking].map((c) => c.kind);
    expect(result.breaking).toEqual([]);
    expect(kinds).toContain('type.added');
    // The diff must not claim any field changed on User.
    expect(result.breaking.some((c) => c.location.startsWith('types:User'))).toBe(false);
    expect(result.nonBreaking.some((c) => c.location.startsWith('types:User'))).toBe(false);
  });

  it('adding a new required inherited field (via new parent) is breaking on the child', () => {
    const specA = mkSpec({
      User: {
        kind: 'object',
        fields: [{ name: 'name', required: true, type: strType }],
      },
    });
    const specB = mkSpec({
      Base: {
        kind: 'object',
        fields: [{ name: 'id', required: true, type: strType }],
      },
      User: {
        kind: 'object',
        extends: ['Base'],
        fields: [{ name: 'name', required: true, type: strType }],
      },
    });
    const result = diffSpecs(specA, specB);
    // User gains `id` via inheritance → breaking added-required.
    const userChange = result.breaking.find((c) => c.location === 'types:User.id');
    expect(userChange).toBeDefined();
    expect(userChange!.kind).toBe('type.field.added.required');
  });

  it('13. structurally identical TypeDefs with different property-insertion order → no diff', () => {
    // Non-object top-level type — hits the `type.changed` catch-all.
    const ta: TypeDef = { kind: 'string', minLength: 1, description: 'x' };
    const tb = { description: 'x', minLength: 1, kind: 'string' } as TypeDef;

    // Object field type — hits the `type.field.type.changed` branch.
    const fieldA: TypeDef = { kind: 'string', minLength: 1, description: 'x' };
    const fieldB = { description: 'x', minLength: 1, kind: 'string' } as TypeDef;

    const specA = mkSpec({
      Foo: ta,
      Bar: { kind: 'object', fields: [{ name: 'f', required: true, type: fieldA }] },
    });
    const specB = mkSpec({
      Foo: tb,
      Bar: { kind: 'object', fields: [{ name: 'f', required: true, type: fieldB }] },
    });

    const result = diffSpecs(specA, specB);
    const kinds = [...result.breaking, ...result.nonBreaking].map((c) => c.kind);
    expect(kinds).not.toContain('type.changed');
    expect(kinds).not.toContain('type.field.type.changed');
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toEqual([]);
  });
});

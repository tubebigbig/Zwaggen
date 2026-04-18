# Spec — Canonical stringify for schema/diff.ts type equality

## Problem

`apps/web/src/schema/diff.ts` uses `JSON.stringify(a) !== JSON.stringify(b)` in six places to check equality between `TypeDef` values (and once for endpoint `tags`):

- line 86-88 — endpoint tags
- line 118 — request body type
- line 151 — response type
- line 280 — object field type
- line 292 — non-object catch-all
- line 373 — param type

JavaScript's `JSON.stringify` serializes object keys in **insertion order** (per ES2015, modulo integer-like string keys). Two `TypeDef` values that are structurally identical but were constructed with different key-insertion order will produce different JSON strings and be reported as "changed" by the diff — a false positive.

Example where this bites today: the OpenAPI importer, the type-builder UI, and the `renameType` rewrite path all construct `TypeDef` objects via different code paths. An imported string type might be `{ kind: 'string', minLength: 1, description: 'x' }` while a UI-edited one is `{ kind: 'string', description: 'x', minLength: 1 }`. `diffSpecs` reports a breaking "type changed" even though nothing about the type actually differs.

## Success criteria

- Equality check returns true for two `TypeDef` values that are structurally identical, regardless of key-insertion order in nested objects.
- Endpoint `tags` equality (an array of strings) still respects order — tags are a list, not a set, and their ordering is user-controlled. No change in semantics for arrays.
- `schema/diff.ts` no longer contains any `JSON.stringify(...)` calls used for equality; all six sites use a single canonical helper.
- Existing `diff.types.test.ts` and `diff.endpoints.test.ts` continue to pass.
- At least one new test demonstrates the fix: two `TypeDef`s with identical contents but different key order are reported as equal by `diffSpecs`.

## Out of scope

- Any semantic change to diff categorization (which changes are "breaking" vs "non-breaking").
- Deeper structural equality (e.g., treating `fields` array order as insignificant, or `enum` arrays as sets). Arrays continue to be order-sensitive.
- Replacing `JSON.stringify` elsewhere in the codebase. This spec covers `diff.ts` only.

## Approach

Add a small pure helper, `canonicalStringify(value: unknown): string`, that recursively walks a value and serializes with object keys sorted. Arrays keep their order. Primitives and `null` serialize as JSON does.

Placement: either a new module `apps/web/src/schema/canonical.ts`, or inline as a private helper at the top of `diff.ts`. **Decision: new module `apps/web/src/schema/canonical.ts`.** Reasons:

1. Pure utility — easier to unit test in isolation.
2. Likely to be reused later (e.g., stable cache keys, deterministic snapshot tests). Extracting now costs one file; inlining later would mean touching `diff.ts` again.
3. Keeps `diff.ts` focused on diff logic.

Shape:

```ts
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) =>
    JSON.stringify(k) + ':' + canonicalStringify((value as Record<string, unknown>)[k]),
  );
  return '{' + parts.join(',') + '}';
}
```

`undefined` values, functions, and symbols: mirror `JSON.stringify`'s behavior — skip them inside objects (they'd produce `undefined` from `JSON.stringify(value)` which would concat as the string "undefined"; handle by filtering keys whose recursive result is `undefined`-equivalent, or by checking `typeof v === 'undefined'` and skipping). For the shapes used in `TypeDef`, `undefined` is common for optional fields. The simple implementation above returns `"undefined"` for `undefined` values — instead, skip such keys to match `JSON.stringify`'s object-property behavior.

Refined implementation:

```ts
export function canonicalStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (v === undefined ? 'null' : canonicalStringify(v))).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;  // mirror JSON.stringify: skip undefined props
    if (typeof v === 'function' || typeof v === 'symbol') continue;
    parts.push(JSON.stringify(k) + ':' + canonicalStringify(v));
  }
  return '{' + parts.join(',') + '}';
}
```

The top-level `undefined` branch returns the string `'undefined'` — callers compare two canonicalStringify results, so as long as both sides get the same treatment, this is a valid equality oracle. `JSON.stringify(undefined)` returns the `undefined` value (not a string), which would make string comparison awkward; using `'undefined'` explicitly makes the oracle a pure string.

Apply across `diff.ts`: replace each `JSON.stringify(X) !== JSON.stringify(Y)` with `canonicalStringify(X) !== canonicalStringify(Y)`. Note line 86-87 (tags) stores results in `aTags`/`bTags` variables before comparing — rename helper calls but keep the variable-based structure.

Tags specifically: per success criteria, tag order matters. Canonical stringify leaves arrays order-sensitive, so the tags comparison still behaves the same as before. Changing it is out of scope.

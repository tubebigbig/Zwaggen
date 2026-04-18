# Type examples — one JSON example per object/array type

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — schema + `TypeBuilder` + `RunPanel` + OpenAPI/Markdown exporters

## Problem

Today the Markdown export shows a skeleton-JSON (string → `"string"`, number → `0`) for each type. That's readable but unconvincing as documentation — no real user ever looks at `{ "age": 0 }` and pictures the API. OpenAPI export emits no `example` at all. And when a dev opens an endpoint in the Try-it panel, the body textarea starts at `{}` every time — they type (or paste) the same realistic payload over and over.

Three pain points from one missing field.

## Goal

Add an optional `example?: unknown` field to object and array types. Surface it in the `TypeBuilder` as a JSON textarea. Wire it three ways:

1. **Request body seed**: in `RunPanel`, a "Seed from example" button fills the body textarea with the resolved example (following `ref` chains if the body is a reference).
2. **OpenAPI export**: emit `example:` on schemas that declare one.
3. **Markdown export**: render the example as an `#### Example` fenced block under the type's schema section.

## Non-goals

- **Not multi-example (`examples: { default: …, invalid: … }`).** One canonical example per type. OpenAPI's multi-example model is overkill for MVP.
- **Not examples on primitives.** A string's example is just a value; users already type values into params. Scope is `object` and `array` only — the shapes users can't enter in a single input.
- **Not example *validation*.** We don't run the type's own validator over the example on save. Users edit through the UI; if they paste something that doesn't match, the Try-it response validation will flag it immediately.
- **Not per-endpoint response examples.** Examples live on types (reusable); response bodies are typed references. Same example flows downstream via `ref`.
- **Not auto-seed-on-open.** The request-body textarea does not auto-fill just because an example exists. The user explicitly clicks "Seed from example" — prevents clobbering in-progress edits.

## Requirements

1. `ObjectType` and `ArrayType` gain `example?: unknown`. No other variants. No schema-version bump (optional field; `JSON.stringify` drops `undefined`).
2. `TypeBuilder`, when editing an object or array type, shows a labeled JSON textarea. Parsing is lazy: on blur, parse the text; if valid JSON, store; if invalid, show an inline error and keep the raw text in a local state so the user can fix without losing work.
3. `RunPanel` gains a "Seed from example" button next to the Body textarea, disabled when:
   - The endpoint has no `requestBody`, OR
   - The resolved body type (following `ref` chains) is not an object or array, OR
   - The resolved type has no `example`.
   Clicking overwrites `bodyText` with `JSON.stringify(example, null, 2)`.
4. OpenAPI exporter emits `example:` on the schema for types that declare one. For `$ref` responses/bodies, the example lives on the referenced schema and OpenAPI viewers (Swagger UI, Redoc) resolve it.
5. Markdown exporter, per named type with an example, emits a new `#### Example` fenced JSON block after the existing skeleton block.
6. Secrets are not special-cased. Examples are authored data, not runtime data — if someone writes a real token into an example, that's their choice and it travels with the spec like any other field.

## Design

### Schema — `apps/web/src/schema/types.ts`

```ts
export interface ObjectType {
  kind: 'object';
  description?: string;
  strict?: boolean;
  fields: ObjectField[];
  example?: unknown;
}
export interface ArrayType {
  kind: 'array';
  element: TypeDef;
  description?: string;
  minItems?: number;
  maxItems?: number;
  example?: unknown;
}
```

No changes to other variants.

### Resolver — `apps/web/src/schema/resolveExample.ts` (new)

Pure helper used by `RunPanel`'s seed button and both exporters:

```ts
import type { Spec, TypeDef } from './types';

export function resolveExample(spec: Spec, t: TypeDef): unknown | undefined {
  const seen = new Set<string>();
  let cur: TypeDef | undefined = t;
  while (cur) {
    if (cur.kind === 'ref') {
      if (seen.has(cur.ref)) return undefined; // cycle: no example
      seen.add(cur.ref);
      cur = spec.types[cur.ref];
      continue;
    }
    if (cur.kind === 'object' || cur.kind === 'array') return cur.example;
    return undefined;
  }
  return undefined;
}
```

Cycle-safe (matches `validator-cycles` rule).

### TypeBuilder — `apps/web/src/ui/TypeBuilder.tsx`

When `value.kind === 'object'` or `value.kind === 'array'`, render under the existing Constraints block:

```
▸ Example (JSON)
┌──────────────────────────────┐
│ { "id": "u_1", "age": 42 }   │
│                              │
└──────────────────────────────┘
[ inline error message if parse failed ]
```

Local state holds the raw text; on blur, `JSON.parse` and either update `value.example` or set an error string. An empty textarea resets `example` to `undefined` (matches the `|| undefined` idiom used elsewhere).

Collapsed-by-default section (similar to the existing Constraints fold) so the editor doesn't get noisy.

### RunPanel — seed button

Next to the body textarea label, a small button `{t('seedFromExample')}`. `disabled` per the rules in requirement 3. Handler:

```ts
function seedBody() {
  if (!endpoint?.requestBody) return;
  const ex = resolveExample(spec, endpoint.requestBody);
  if (ex === undefined) return;
  setBodyText(JSON.stringify(ex, null, 2));
}
```

### OpenAPI exporter — `apps/web/src/exporters/openapi.ts`

In `toSchema(t)`, for `object` and `array` branches, if `t.example !== undefined`, set `s.example = t.example`. Deep-clone? No — the spec is already JSON-serializable; whatever is in `t.example` can go straight into the output and `JSON.stringify` handles it.

### Markdown exporter — `apps/web/src/exporters/markdown.ts`

In the Types block, for each named type, after the skeleton block, if the top-level type has an `example`, append:

```md
#### Example

```json
{ "id": "u_1", "age": 42 }
```
```

Only the top-level type's example renders — nested types' examples live under their own named-type section. (An inline `{ kind: 'object', example: … }` used as a request body gets its example via the OpenAPI path; Markdown only iterates named types.)

## Testing

### Unit — `apps/web/tests/schema/resolveExample.test.ts` (new)

- Direct object with example → returns example.
- Direct array with example → returns example.
- Primitive types (string/number/etc.) → returns `undefined`.
- `ref` → resolves through to the target type's example.
- Chained refs → walks through until a concrete type.
- Cycle (`A` refs `B` refs `A`) → returns `undefined` safely.
- Missing ref target → returns `undefined`.

### Unit — serialize round-trip

Extend `apps/web/tests/schema/serialize.test.ts`:
- Type with `example` round-trips unchanged.
- Type without `example` emits JSON with no `"example"` key.

### Component — `TypeBuilder` example editor

New file `apps/web/tests/ui/TypeBuilder.example.test.tsx`:
- Render an object type with no example. Type valid JSON into the example textarea; blur. Assert `value.example` is the parsed object.
- Render with an example; clear the textarea; blur. Assert `value.example` is `undefined`.
- Type invalid JSON; blur. Assert inline error visible and `value.example` unchanged from prior state.
- For a `string` type (primitive), the example textarea is NOT rendered.

### Component — `RunPanel` seed button

Extend `apps/web/tests/ui/RunPanel.test.tsx` (or new file `RunPanel.seed.test.tsx`):
- Endpoint with `requestBody = ref('User')`, `User` is object with example. Button enabled. Click → body textarea fills with pretty-printed example JSON.
- Endpoint with no requestBody → button disabled or hidden.
- Endpoint with a primitive requestBody → button disabled.
- Endpoint with object requestBody that has no example → button disabled.

### Unit — OpenAPI exporter

Extend `apps/web/tests/exporters/openapi.test.ts`:
- Object type with example → schema has `example` key with the same value.
- Type without example → schema has no `example` key.
- Array type with example array → schema has `example: [...]`.

### Unit — Markdown exporter

Extend `apps/web/tests/exporters/markdown.test.ts`:
- Named type with example → output contains `#### Example` followed by a fenced JSON block with the stringified example.
- Type without example → output contains no `#### Example` heading for that type.

## Error handling

- Invalid JSON in the editor: inline error, no store mutation (keeps user's in-progress text locally).
- Circular refs during resolve: silently return `undefined` — the seed button disables, the exporter skips emitting `example`.
- Example present but shape doesn't match the declared type: not validated at spec level. The user sees the mismatch at runtime when they Send (existing validator flags it).

## Open questions

None. Future follow-up if the community asks: OpenAPI `examples` (multi-example with names) — deferred.

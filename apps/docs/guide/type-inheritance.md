---
description: Object types can extend one or more parents, inheriting fields and overriding them. Maps 1:1 to OpenAPI allOf.
---

# Type inheritance

Object types can **extend** one or more parent object types. The child inherits every field from every parent, and can override any inherited field by redefining it under the same name. This is the right tool when two types share most of their shape and differ in a few fields — no more duplicating `id`, `createdAt`, `updatedAt` across a dozen similar types.

Inheritance is opt-in: types without an `extends` field render exactly as before.

## Declaring extends

Select an object type in the Type Builder. A new **Extends** chip picker appears above the fields list. Pick a parent from the dropdown; it becomes a chip in the row. Pick another to add a second parent; click the `×` on a chip to remove.

Candidate parents are filtered for you:

- Only other object types appear in the dropdown (primitives, unions, arrays can't be extended).
- The currently-selected type can't pick itself.
- Any parent that would form a cycle (`A extends B extends A`) is excluded automatically.

A parent that later gets deleted or renamed to a non-object kind is surfaced as a broken reference in the Type Builder's alert strip — same treatment as broken `$ref`s.

Parent chips can be drag-reordered to change precedence: grab a chip and drop it over another, or use keyboard DnD (`Space` to grab, arrow keys to move, `Space` to drop, `Escape` to cancel).

## Inherited fields panel

Once a type has at least one parent, an **Inherited fields** panel renders below the chip row. It lists every field inherited from the parent chain, one per row, dimmed. Each row shows the field name, a kind badge, whether it's required, and an **Override** button on the right.

Clicking **Override** copies the inherited field into the child's own `fields[]` as a new row pre-populated with the parent's definition. The inherited row disappears from the panel (because the child now owns it), and the child's row picks up an **(override)** badge plus a small **Revert** (`↶`) button.

- Edit the overridden field like any other — change the type, flip required, tweak constraints. The child's definition wins.
- Click **Revert** to remove the override and fall back to the parent's definition. The row moves back into the Inherited fields panel.

## Override semantics

- **Child wins completely** when a field name matches a parent's. No partial merging — the override is a full redefinition.
- **Precedence**: parents are merged left-to-right in the order you picked them; later parents win over earlier ones; the child wins over all parents. So `Foo extends [Bar, Baz]` with `Bar: {x, y}`, `Baz: {y, z}`, and child `Foo: {z, w}` resolves to:

```
x  — from Bar
y  — from Baz (overrides Bar)
z  — from Foo (overrides Baz)
w  — from Foo (new)
```

- **Strict mode is OR'd.** If any parent is strict, the effective type is strict. Children can set strict themselves but can't un-strict an inherited parent.
- **You can't remove** an inherited field. OpenAPI `allOf` has no "minus this field" primitive. If you need a parent without one of its fields, don't extend that parent.
- **No generic / conditional extends.** Simple structural inheritance only.

## What consumers see

Wherever the app needs the **effective** shape (as opposed to the declared hierarchy), it flattens on the fly:

- **Runtime validation** checks inherited required fields. A response missing a parent's `id` is rejected.
- **Example generation** in the Run panel walks the chain so inherited fields appear in the seed payload.
- **Spec diff** compares the resolved shape, so refactoring a flat type into `Foo extends Base` with identical effective fields produces an empty diff.

The Type Builder itself **doesn't** flatten — it always shows your declared hierarchy so you can keep editing it naturally. Only the inherited-fields panel is computed via the resolver.

## OpenAPI round-trip

Extension maps directly to `allOf`:

```yaml
User:
  allOf:
    - $ref: '#/components/schemas/Base'
    - type: object
      properties:
        name: { type: string }
      required: [name]
```

- **Export** — parents become `$ref`s; the child's own fields (if any) land in a single inline object member. Types that inherit without adding anything export as `allOf: [...refs]` with no inline member.
- **Import** — allOf with one or more `$ref`s plus at most one inline object is recovered as `{ extends: [...refs], fields: inline.fields }`. allOf with multiple inline objects and no `$ref`s falls back to the legacy flatten-into-one-object behavior, so historical specs authored before this feature keep working.
- Folder-qualified parents export with the flattened key form (`auth_Base` for a parent keyed `auth/Base`) and the `x-folder` extension preserves the original path on import.

## JSON Schema and Markdown

- **JSON Schema exporter** emits the same `allOf` pattern using `#/$defs/…` references.
- **Markdown exporter** prepends an **Extends:** line before each extended type's JSON skeleton, with each parent rendered as a clickable link to that parent's section. Refs in param tables are also clickable anchors now.

## Migrating a flat type

If you already have a flat type that duplicates another type's fields, migration is a small edit:

1. Keep the parent as-is.
2. Open the child in the Type Builder. Add the parent in the Extends picker.
3. For each field that already matches a parent's definition, delete the row from the child (the inherited row auto-reappears).
4. For fields that diverge, keep them — they become the overrides.

Run a spec diff against the pre-migration version to confirm nothing changed semantically. An empty diff means the refactor is safe.

## What extends does NOT do

- **No non-object extends.** Only object types.
- **No removing inherited fields.** OpenAPI can't express subtraction.
- **No conditional / generic extends.** Structural inheritance only; no type parameters.
- **No "effective shape" preview panel** (deferred polish). The inherited + override rows already give you the full picture.

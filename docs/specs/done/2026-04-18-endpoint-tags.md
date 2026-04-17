# Endpoint tags — group-by-tag in the Endpoint list + OpenAPI tag export

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — schema + `EndpointEditor` + `EndpointList` + OpenAPI + Markdown exporters

## Problem

Once a spec grows past ~10 endpoints the flat list in `EndpointList` becomes an unordered scroll. OpenAPI solves this with `tags` — every operation declares one or more tags, and tools (Swagger UI, Redoc, Stoplight, generated SDKs) group operations by tag. Zwaggen has no tag concept today: every endpoint shows up flat, alphabetically-by-insertion-order. There is also no useful export signal for downstream consumers that rely on `tags` to section their docs.

## Goal

Give each endpoint an optional string list `tags`. Render the Endpoint sidebar grouped by tag (with a "Untagged" bucket), collapsible per group. Export tags into both OpenAPI (per-operation `tags[]` plus a top-level `tags[]` description block) and Markdown (one H2 per tag, endpoints nested under it).

## Non-goals

- **Not per-tag color / icon customization.** Tags get a plain textual header; visual polish can come later.
- **Not tag renaming with cascade** beyond "edit the string in each endpoint." Renaming a tag today is a find-and-replace across endpoints; a bulk-rename tool is deferred.
- **Not multi-select filtering.** The sidebar groups, it doesn't filter. A search/filter box is its own feature.
- **Not a spec-level `tags[]` with descriptions.** OpenAPI allows documenting each tag with a description; we defer that — the exporter just lists the tags it finds on operations.
- **Not a tag autocomplete dropdown in MVP.** A datalist hint using existing tag names is the stretch — optional.

## Requirements

1. **Schema**: `Endpoint.tags?: string[]` — optional, unset defaults to empty on read. No schema version bump (optional field; `JSON.stringify` drops undefined).
2. **Editor**: a Tags row appears in `EndpointEditor` (near Method/Path). Input accepts comma-separated values; chips render for each tag with an X to remove; Enter commits the current input. Empty normalization trims whitespace and drops empties.
3. **Sidebar grouping**: `EndpointList` renders endpoints grouped by tag. Endpoints with multiple tags appear under every tag they declare (duplicated in the UI, not the data). Endpoints with no tags appear in an "Untagged" bucket at the bottom. Groups with a single endpoint still render as groups — consistency wins over density.
4. **Sort order**: tag group headers sorted alphabetically (case-insensitive); "Untagged" is always last. Inside each group, endpoints preserve `spec.endpoints` order.
5. **Group collapse**: each group header is a button that toggles collapse. Collapse state is UI preference (per-tag key stored in `state/uiPrefs`), not spec content.
6. **OpenAPI export**: each operation emits `tags: [...endpoint.tags]` when non-empty. The top-level `tags: [{ name }]` array lists every tag used in the spec (no description — spec non-goal).
7. **Markdown export**: endpoints grouped under `## <Tag>` H2 headings, sorted as in the UI. An operation with multiple tags appears once — under the first tag in its array — to keep the document linear. Untagged endpoints render under a final `## Untagged` group.

## Design

### Schema — `apps/web/src/schema/types.ts`

```ts
export interface Endpoint {
  // …existing fields
  tags?: string[];
}
```

Add to `defaults.ts` if endpoint factories exist (currently new endpoints are built inline in `EndpointList.add()` — leave that alone; `tags` stays undefined until the user sets it).

### Editor — `apps/web/src/ui/EndpointEditor.tsx`

A new row just below Method + Path:

```
Tags  [users ×] [admin ×] [ + type to add ]
```

Tokenization:
- Comma or Enter commits the current buffer as a tag (trim + reject empties + dedupe per endpoint).
- X on a chip removes that tag.
- Empty commit resets `tags` back to `undefined` so it does not persist as `[]`.

Store updates use the existing `setSpec({...spec, endpoints: spec.endpoints.map(...)})` pattern.

### Sidebar — `apps/web/src/ui/EndpointList.tsx`

Compute a grouping once per render:

```ts
interface Group { tag: string | null; endpoints: Endpoint[] }

function groupByTag(endpoints: Endpoint[]): Group[] {
  const byTag = new Map<string, Endpoint[]>();
  const untagged: Endpoint[] = [];
  for (const e of endpoints) {
    const tags = e.tags ?? [];
    if (tags.length === 0) { untagged.push(e); continue; }
    for (const t of tags) {
      const bucket = byTag.get(t) ?? [];
      bucket.push(e);
      byTag.set(t, bucket);
    }
  }
  const out: Group[] = [...byTag.entries()]
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([tag, list]) => ({ tag, endpoints: list }));
  if (untagged.length) out.push({ tag: null, endpoints: untagged });
  return out;
}
```

Render each group with a collapsible header:

```
▾ users      (3)
    GET /users
    POST /users
    GET /users/{id}
▸ admin     (2)
▾ Untagged   (1)
    GET /health
```

Collapse state lives in `state/uiPrefs.ts` under a new record `endpointGroupCollapsed: Record<string, boolean>` (key is the tag, or the sentinel `"__untagged"` for the null group).

**When the list has zero tags**: render flat as today. Detect this by `groups.length === 1 && groups[0].tag === null`. No headers, no collapse affordance — same UX as pre-feature.

### OpenAPI exporter — `apps/web/src/exporters/openapi.ts`

Per-operation:

```ts
if (e.tags && e.tags.length) p[e.method.toLowerCase()].tags = [...e.tags];
```

Top-level, after building `paths`:

```ts
const usedTags = new Set<string>();
for (const e of spec.endpoints) for (const t of e.tags ?? []) usedTags.add(t);
if (usedTags.size) doc.tags = [...usedTags].sort().map((name) => ({ name }));
```

### Markdown exporter — `apps/web/src/exporters/markdown.ts`

Primary tag assignment: an operation's "primary tag" is `e.tags?.[0] ?? null`. Group by primary tag, sort groups as in the UI, emit `## <tag>` headers. Within each group, preserve `spec.endpoints` order. Keep the existing endpoint body rendering unchanged — only the sectioning changes.

## Architecture & data flow

```
spec.endpoints  ──► groupByTag(endpoints)  ──► Group[]
                                                   │
                          ┌────────────────────────┼─────────────────────────┐
                          ▼                        ▼                         ▼
                   EndpointList               OpenAPI exporter       Markdown exporter
                (render as sections)        (tags per op + top-       (one H2 per primary
                                             level tags[])            tag; primary-tag
                                                                      groups endpoints)
```

`groupByTag` lives in `schema/` so all three consumers share it (preventing drift between what the sidebar shows and what the exports declare).

## Testing

### Unit — `apps/web/tests/schema/groupByTag.test.ts` (new)

- Zero endpoints → empty array.
- All untagged → single group `{ tag: null }`.
- Tagged + untagged mix → tag groups alphabetically first, untagged last.
- Endpoint with two tags appears in both tag buckets, original spec order preserved within each.
- Tag sort is case-insensitive (`Admin` and `admin` do **not** merge — they're distinct tags — but their ordering is compared case-insensitively).
- Duplicate tags on the same endpoint collapse (dedupe happens on write in the editor, but the grouping defends against loaded data).

### Unit — OpenAPI exporter

Extend `apps/web/tests/exporters/openapi.test.ts`:
- Operation with tags emits `paths[path][method].tags`.
- Top-level `tags: [{ name }]` lists all unique tags, sorted.
- Spec with no tagged endpoints omits both the per-op `tags` key and the top-level `tags` key.

### Unit — Markdown exporter

Extend `apps/web/tests/exporters/markdown.test.ts`:
- Output contains `## users` and `## admin` H2s when endpoints carry those tags.
- Endpoint with two tags renders once, under its first tag.
- Untagged endpoints appear under `## Untagged`.
- Spec with zero tags renders without any H2 tag heading (current behavior preserved).

### Component — `apps/web/tests/ui/EndpointList.grouping.test.tsx` (new)

- Two tagged groups render as collapsible sections with counts.
- Clicking a group header toggles its collapse state; persists in `uiPrefs`.
- Untagged group appears last.
- Flat rendering when no tags exist — no headers, no counts.
- An endpoint with two tags is reachable from both group sections.

### Component — `apps/web/tests/ui/EndpointEditor.tags.test.tsx` (new)

- Typing a tag and pressing Enter adds a chip.
- Comma commits too.
- Clicking the chip X removes the tag.
- Removing the last tag resets `endpoint.tags` to `undefined` (not `[]`).
- Duplicate input is ignored.

## Error handling

No new error surfaces. A tag containing whitespace is trimmed on commit; a tag that is all whitespace is dropped. A tag containing unusual characters (Unicode, punctuation) is preserved — the feature is intentionally lenient on content, strict on shape (must be a non-empty trimmed string).

## Open questions

None at design time. A future follow-up could add tag descriptions at the spec level (OpenAPI `tags[].description`) and color coding in the sidebar.

# Endpoint tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give endpoints an optional `tags` list, group the sidebar by tag (with collapse), and emit tags in both OpenAPI and Markdown exports.

**Spec:** `docs/specs/active/2026-04-18-endpoint-tags.md`

**Architecture:** Add optional `Endpoint.tags?: string[]`. Introduce a shared `groupByTag(endpoints)` in `schema/` that the sidebar, the OpenAPI exporter, and the Markdown exporter all consume. Add a Tags chip-input to `EndpointEditor`. Persist per-tag collapse state in `state/uiPrefs.ts`. No schema version bump — the field is optional.

**Tech Stack:** existing only.

---

## Rules Applied
`docs/rules/spec-versioning.md` — adding optional `Endpoint.tags` does not require a bump (old readers ignore unknown fields; new writers drop `undefined`).

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/schema/types.ts` | Add `tags?: string[]` to `Endpoint` |
| Create | `apps/web/src/schema/groupByTag.ts` | Shared grouping helper + Group type |
| Modify | `apps/web/src/state/uiPrefs.ts` | Add `endpointGroupCollapsed: Record<string, boolean>` |
| Modify | `apps/web/src/ui/EndpointEditor.tsx` | Tags row (chips + input) |
| Modify | `apps/web/src/ui/EndpointList.tsx` | Render grouped sidebar |
| Modify | `apps/web/src/exporters/openapi.ts` | Per-op `tags` + top-level `tags[]` |
| Modify | `apps/web/src/exporters/markdown.ts` | Section by primary tag |
| Modify | `apps/web/src/i18n/locales/en.json` / `zh-TW.json` | Add `tags`, `untagged`, `addTag` keys |
| Create | `apps/web/tests/schema/groupByTag.test.ts` | Unit tests |
| Create | `apps/web/tests/ui/EndpointEditor.tags.test.tsx` | Chip-input tests |
| Create | `apps/web/tests/ui/EndpointList.grouping.test.tsx` | Grouped sidebar tests |
| Modify | `apps/web/tests/exporters/openapi.test.ts` | Tag emission tests |
| Modify | `apps/web/tests/exporters/markdown.test.ts` | Section emission tests |

---

## Tasks

### Task 1: Schema field + grouping helper

**Files:**
- Modify: `apps/web/src/schema/types.ts`
- Create: `apps/web/src/schema/groupByTag.ts`
- Create: `apps/web/tests/schema/groupByTag.test.ts`

**Acceptance criteria covered:** spec requirements 1, 3, 4.

- [ ] **Step 1: Add the field**

```ts
export interface Endpoint {
  // …existing
  tags?: string[];
}
```

- [ ] **Step 2: Create `groupByTag.ts`**

```ts
import type { Endpoint } from './types';

export interface Group { tag: string | null; endpoints: Endpoint[] }

export function groupByTag(endpoints: Endpoint[]): Group[] {
  const byTag = new Map<string, Endpoint[]>();
  const untagged: Endpoint[] = [];

  for (const e of endpoints) {
    const tags = Array.from(new Set((e.tags ?? []).filter((t) => t && t.trim())));
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

- [ ] **Step 3: Unit tests** — required cases per the spec's Testing section. Use a small `mkEndpoint(tags: string[], path = '/p')` helper.

- [ ] **Step 4**: `pnpm --filter web test -- groupByTag` — green.

- [ ] **Step 5: Commit**

`feat(schema): optional Endpoint.tags + groupByTag helper`

---

### Task 2: Tags chip-input in `EndpointEditor`

**Files:**
- Modify: `apps/web/src/ui/EndpointEditor.tsx`
- Modify: `apps/web/src/i18n/locales/en.json` and `zh-TW.json` (`tags`, `addTag`)
- Create: `apps/web/tests/ui/EndpointEditor.tags.test.tsx`

**Acceptance criteria covered:** spec requirement 2.

- [ ] **Step 1: Small reusable chip-input**

Add a local `TagInput` component (or inline subcomponent) inside `EndpointEditor.tsx`:

```tsx
function TagInput({ value, onChange }: { value: string[]; onChange(next: string[] | undefined): void }) {
  const { t } = useTranslation();
  const [buffer, setBuffer] = useState('');

  function commit(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (value.includes(tag)) { setBuffer(''); return; }
    const next = [...value, tag];
    onChange(next);
    setBuffer('');
  }

  function remove(tag: string) {
    const next = value.filter((t) => t !== tag);
    onChange(next.length ? next : undefined); // reset to undefined when empty
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
      {value.map((tag) => (
        <span key={tag} className="chip bg-slate-100 text-slate-700">
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            className="ml-1 text-slate-400 hover:text-slate-700"
            onClick={() => remove(tag)}
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-label={t('tags')}
        className="min-w-[80px] flex-1 border-0 bg-transparent text-xs focus:outline-none"
        placeholder={t('addTag')}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(buffer); }
          if (e.key === 'Backspace' && buffer === '' && value.length) remove(value[value.length - 1]!);
        }}
        onBlur={() => commit(buffer)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Mount the row**

Insert a row in the editor beneath Method/Path:

```tsx
<label className="block">
  <span className="text-xs text-slate-500">{t('tags')}</span>
  <div className="mt-1">
    <TagInput
      value={endpoint.tags ?? []}
      onChange={(next) => patchEndpoint({ tags: next })}
    />
  </div>
</label>
```

`patchEndpoint({ tags: undefined })` should drop the key — follow the existing `version: e.target.value || undefined` pattern so it does not serialize as `"tags": []`.

- [ ] **Step 3: i18n keys**

Add to both locales:
- en: `"tags": "Tags"`, `"addTag": "Add tag…"`, `"untagged": "Untagged"`
- zh-TW: `"tags": "標籤"`, `"addTag": "新增標籤…"`, `"untagged": "未分類"`

- [ ] **Step 4: Component test**

`apps/web/tests/ui/EndpointEditor.tags.test.tsx`:
- Type `users` then Enter → chip appears; endpoint's `tags` equals `['users']`.
- Type `admin,` → comma commits; `tags` is `['users', 'admin']`.
- Click the chip X on `users` → `tags` is `['admin']`.
- Remove the last chip → `endpoint.tags` is `undefined` (assert via `('tags' in endpointAfter) === false` or direct undefined).
- Enter a duplicate `users` → no-op.

- [ ] **Step 5**: `pnpm --filter web test -- EndpointEditor.tags` — green.

- [ ] **Step 6: Commit**

`feat(web): tag chip-input in the endpoint editor`

---

### Task 3: Grouped sidebar

**Files:**
- Modify: `apps/web/src/state/uiPrefs.ts`
- Modify: `apps/web/src/ui/EndpointList.tsx`
- Create: `apps/web/tests/ui/EndpointList.grouping.test.tsx`

**Acceptance criteria covered:** spec requirements 3, 4, 5.

- [ ] **Step 1: Add collapse-state map to uiPrefs**

Extend `uiPrefs.ts` with `endpointGroupCollapsed: Record<string, boolean>` (default `{}`). Add a setter keyed by tag (use the sentinel `__untagged` for the null bucket):

```ts
export function toggleEndpointGroup(key: string) {
  setUiPref('endpointGroupCollapsed', {
    ...getUiPref('endpointGroupCollapsed'),
    [key]: !getUiPref('endpointGroupCollapsed')[key],
  });
}
```

(Adapt to whatever API `uiPrefs.ts` already exposes — use the same pattern as existing prefs.)

- [ ] **Step 2: Render groups**

Replace the flat `<ul>` in `EndpointList.tsx` with a per-group render. Use the existing item button; only the wrapping structure changes:

```tsx
const groups = groupByTag(spec.endpoints);
const collapsedMap = useUiPrefs().endpointGroupCollapsed ?? {};

// Flat fallback when the spec has no tags at all.
const flat = groups.length === 1 && groups[0]!.tag === null;
```

When `flat`, render today's list verbatim. Otherwise, each group renders a collapsible header:

```tsx
{groups.map((g) => {
  const key = g.tag ?? '__untagged';
  const collapsed = !!collapsedMap[key];
  return (
    <li key={key}>
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
        onClick={() => toggleEndpointGroup(key)}
      >
        {collapsed ? <IconChevronRight /> : <IconChevronDown />}
        <span>{g.tag ?? t('untagged')}</span>
        <span className="ml-auto text-[10px] font-normal text-slate-400">{g.endpoints.length}</span>
      </button>
      {!collapsed && (
        <ul className="ml-2 space-y-0.5">
          {g.endpoints.map((e) => <EndpointListItem key={`${key}:${e.id}`} endpoint={e} />)}
        </ul>
      )}
    </li>
  );
})}
```

Extract the existing item button into a small `EndpointListItem` subcomponent to reuse the same markup in both the flat and grouped paths.

- [ ] **Step 3: Component test**

`apps/web/tests/ui/EndpointList.grouping.test.tsx`:
- Two tagged groups render as collapsible headers with counts `2`, `3`.
- Click a group header → the child endpoints hide; click again → they reappear.
- Multi-tag endpoint (tags `['users','admin']`) reachable from both sections (found twice by text).
- Untagged group renders last.
- Spec with no tags: no group headers, flat list (backwards-compatible path).

- [ ] **Step 4**: `pnpm --filter web test -- EndpointList` — green.

- [ ] **Step 5: Commit**

`feat(web): group endpoints by tag in the sidebar with collapse state`

---

### Task 4: OpenAPI exporter — per-op + top-level tags

**Files:**
- Modify: `apps/web/src/exporters/openapi.ts`
- Modify: `apps/web/tests/exporters/openapi.test.ts`

**Acceptance criteria covered:** spec requirement 6.

- [ ] **Step 1: Emit per-op tags**

In the endpoints loop:

```ts
const op: any = {
  summary: e.description,
  parameters: [...],
  ...(e.requestBody ? { requestBody: {...} } : {}),
  responses: {...},
};
if (e.tags && e.tags.length) op.tags = [...e.tags];
p[e.method.toLowerCase()] = op;
```

- [ ] **Step 2: Emit top-level tags[]**

Before returning the doc:

```ts
const used = new Set<string>();
for (const e of spec.endpoints) for (const t of e.tags ?? []) used.add(t);
if (used.size) doc.tags = [...used].sort().map((name) => ({ name }));
```

- [ ] **Step 3: Tests**

Add to `openapi.test.ts`:
- Endpoint with `tags: ['users']` → `paths['/x'].get.tags === ['users']`.
- Spec using `users` and `admin` across two endpoints → `doc.tags === [{ name: 'admin' }, { name: 'users' }]` (sorted).
- Untagged-only spec → no `tags` key anywhere (`'tags' in doc === false`, `'tags' in op === false`).

- [ ] **Step 4**: `pnpm --filter web test -- openapi` — green.

- [ ] **Step 5: Commit**

`feat(export): OpenAPI per-operation tags + top-level tags[]`

---

### Task 5: Markdown exporter — section by primary tag

**Files:**
- Modify: `apps/web/src/exporters/markdown.ts`
- Modify: `apps/web/tests/exporters/markdown.test.ts`

**Acceptance criteria covered:** spec requirement 7.

- [ ] **Step 1: Group by primary tag**

Inside `toMarkdown`, after the Types block and before the endpoints loop:

```ts
const primaryTag = (e: Endpoint) => e.tags?.[0] ?? null;
const groups = new Map<string | null, Endpoint[]>();
for (const e of spec.endpoints) {
  const key = primaryTag(e);
  const list = groups.get(key) ?? [];
  list.push(e);
  groups.set(key, list);
}

const ordered: (string | null)[] = [
  ...[...groups.keys()].filter((k): k is string => k !== null).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
  ...(groups.has(null) ? [null as const] : []),
];
```

Replace the existing flat endpoints loop with a grouped loop:

```ts
for (const key of ordered) {
  out.push(`\n## ${key ?? 'Untagged'}\n`);
  for (const e of groups.get(key)!) {
    // existing per-endpoint rendering, but demoted to H3+
    out.push(`\n### ${e.method} ${e.path}\n`);
    // …
  }
}
```

Downgrade internal endpoint-local headings by one level (from `###` to `####` and so on) so the section hierarchy remains clean. If a spec has no tagged endpoints, the only group is `Untagged` — acceptable but slightly noisy; see Step 2.

- [ ] **Step 2: Backward-compat — omit sectioning when all endpoints are untagged**

When `ordered.length === 1 && ordered[0] === null`, skip the `## Untagged` header and render the endpoints flat (keeping today's output for tag-free specs, so this feature doesn't regress rendered docs).

- [ ] **Step 3: Tests**

Add to `markdown.test.ts`:
- Tagged endpoints produce `## users` and `## admin` with correct endpoints underneath.
- An endpoint with `tags: ['users', 'admin']` appears under `## users` only.
- Untagged endpoints appear under `## Untagged` when the spec has any tagged endpoints.
- Spec with zero tags → no `##` section for Untagged, endpoints render flat (existing snapshot stays valid; if snapshot exists, update it minimally).

- [ ] **Step 4**: `pnpm --filter web test -- markdown` — green.

- [ ] **Step 5: Commit**

`feat(export): Markdown sections by primary endpoint tag`

---

### Task 6: Full-suite verification + UX pass + docs move

**Files:** none.

- [ ] **Step 1**: `pnpm --filter web test` — full web suite green.
- [ ] **Step 2**: `pnpm --filter web test:e2e` — green.
- [ ] **Step 3: Manual UX pass**

`pnpm dev`, then:

1. Create three endpoints: `GET /users` tagged `users`, `POST /users` tagged `users`, `GET /health` untagged. Verify sidebar groups show `USERS (2)` and `UNTAGGED (1)`.
2. Collapse the `USERS` group. Reload the page. Confirm the group stays collapsed (persisted in uiPrefs).
3. Add the tag `admin` to `GET /users`. Confirm it appears under *both* `ADMIN` and `USERS`.
4. Export OpenAPI. Inspect: per-op `tags`, and top-level `tags: [{ name: 'admin' }, { name: 'users' }]`.
5. Export Markdown. Confirm `## admin` first, then `## users`, then `## Untagged`. `GET /users` is under `## admin` only (primary tag).
6. Remove all tags from every endpoint. Sidebar falls back to flat; Markdown export has no tag headers.

- [ ] **Step 4: Move docs**

On merge:
- Move `docs/specs/active/2026-04-18-endpoint-tags.md` → `docs/specs/done/`.
- Move `docs/plans/active/2026-04-18-endpoint-tags.md` → `docs/plans/done/`.
- Commit: `docs: mark endpoint-tags done`.

---

## Open Questions
None at plan time. A future stretch is a datalist of existing tags as suggestion when typing a new tag — trivial add once this is in.

# DnD polish bundle + Codegen v1.2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle five quality-of-life fixes from prior code reviews into one slice — codegen v1.2's symmetric zod object expansion + four DnD polish items (zh-TW announcements, sentinel collision, no-op feedback, keyboard e2e).

**Architecture:** Pure quality work. No schema changes, no new packages, no breaking API changes. Stacks on `main`.

**Tech Stack:** Existing — TypeScript, vitest, Playwright, react-i18next, @dnd-kit. No new deps.

---

### Spec

See `docs/specs/active/2026-04-23-dnd-polish-and-codegen-v1.2.md`. Key constraints:

- Sentinels can share `'$$ROOT$$'` since they're scoped per `DndContext`.
- `setTypeFolder` / `setEndpointFolder` return `Promise<{ ok: boolean; reason?: ... }>`.
- Inline aria-live banner for collision feedback (no new toast infra).
- Codegen v1.2 is the SMALLEST possible v1.2 — only the `zodTypeExpr` object case.

---

### Task 1: Codegen v1.2 — `zodTypeExpr` object case

**Files:**
- Modify: `packages/cli/src/generate/client.ts`
- Modify: `packages/cli/tests/generate/client.test.ts` (or v1.1 fixture)

- [ ] **Step 1: Failing test**

```ts
test('inline-object response shapes generate z.object expansion (not z.unknown)', () => {
  const spec = {
    ...emptySpec(),
    info: { ...emptySpec().info, baseUrl: 'http://api' },
    endpoints: [{
      id: 'list', method: 'GET', path: '/items', tags: ['default'],
      pathParams: [], queryParams: [], headers: [], requestBody: null,
      responses: [{
        status: 200,
        type: { kind: 'array', element: { kind: 'object', fields: [
          { name: 'id', required: true, type: { kind: 'integer' } },
          { name: 'name', required: false, type: { kind: 'string' } },
        ] } },
      }],
      auth: 'inherit', useProxy: 'inherit',
    }],
  };
  const out = generateClient(spec);
  expect(out).toContain('z.array(z.object({');
  expect(out).toContain('"id": z.number()');
  expect(out).toContain('"name": z.string().optional()');
  expect(out).not.toMatch(/z\.array\(z\.unknown\(\)\)/);
});
```

- [ ] **Step 2: Add the object case to `zodTypeExpr`**

Find `zodTypeExpr` in `packages/cli/src/generate/client.ts`. Add the object case before the default:

```ts
case 'object': {
  if (def.fields.length === 0) return 'z.object({})';
  const fields = def.fields.map((f) => {
    const inner = zodTypeExpr(f.type);
    const tail = f.required ? '' : '.optional()';
    return `${JSON.stringify(f.name)}: ${inner}${tail}`;
  }).join(', ');
  return `z.object({ ${fields} })`;
}
```

- [ ] **Step 3: Tests pass**

```bash
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
```

The v1.1 golden may need updating if the v1.1 fixture has any inline-object responses. Inspect the diff. Update if needed.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/generate/client.ts packages/cli/tests/generate/
git commit -m "$(cat <<'EOF'
feat(cli/codegen): zodTypeExpr expands inline objects (v1.2)

Mirror of the v1.1 tsRefType fix: response parsers for inline-object
shapes now generate z.object({...}) instead of z.unknown(). Empty
objects emit z.object({}).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: DnD sentinel collision fix

**Files:**
- Modify: `apps/web/src/ui/TypePanel.tsx`
- Modify: `apps/web/src/ui/EndpointList.tsx`
- Create or modify: `apps/web/tests/ui/dnd-sentinel.test.ts` (or extend an existing folder/dnd test)

- [ ] **Step 1: Failing test**

```ts
import { isValidSegment } from '@zwaggen/core';
import { TYPE_PANEL_ROOT_ID } from '../../src/ui/TypePanel';
import { ENDPOINT_LIST_ROOT_ID } from '../../src/ui/EndpointList';

test('DnD root sentinels are rejected by isValidSegment', () => {
  expect(isValidSegment(TYPE_PANEL_ROOT_ID)).toBe(false);
  expect(isValidSegment(ENDPOINT_LIST_ROOT_ID)).toBe(false);
});
```

This will FAIL currently because `'__root__'` matches `[A-Za-z0-9_. -]+`.

- [ ] **Step 2: Switch sentinels**

In `apps/web/src/ui/TypePanel.tsx`:
```ts
export const TYPE_PANEL_ROOT_ID = '$$ROOT$$';
```

In `apps/web/src/ui/EndpointList.tsx`:
```ts
export const ENDPOINT_LIST_ROOT_ID = '$$ROOT$$';
```

(Both use `$$ROOT$$` — `$` is not in `[A-Za-z0-9_. -]` so `isValidSegment` rejects.)

- [ ] **Step 3: Test passes + run web suite**

```bash
pnpm --filter web test
pnpm --filter web lint
```

The pointer-DnD tests should still pass — they use the imported constant, not the literal.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/ui/TypePanel.tsx apps/web/src/ui/EndpointList.tsx apps/web/tests/ui/dnd-sentinel.test.ts
git commit -m "$(cat <<'EOF'
fix(web): switch DnD root sentinels to a value isValidSegment rejects

'__root__' is a valid folder segment, so a user could create a folder
literally named __root__ that collides with the DnD root drop zone.
Switch both sentinels to '$$ROOT$$' (the $ char is not in the segment
allow-list).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: setTypeFolder / setEndpointFolder collision feedback

**Files:**
- Modify: `apps/web/src/state/store.ts` — change return signatures.
- Modify: `apps/web/src/ui/TypePanel.tsx` — handle the result; render aria-live banner.
- Modify: `apps/web/src/ui/EndpointList.tsx` — same.
- Modify: `apps/web/src/i18n/locales/{en,zh-TW}.json` — collision message string.
- Modify: `apps/web/tests/state/store.test.ts` — collision branch unit test.

- [ ] **Step 1: Update store action signatures**

```ts
async setTypeFolder(typeKey: string, folder: string | null): Promise<{ ok: boolean; reason?: 'unknown' | 'noop' | 'collision' }> {
  const spec = get().spec;
  if (!spec.types[typeKey]) return { ok: false, reason: 'unknown' };
  const { name } = splitKey(typeKey);
  const newFolder = folder ?? undefined;
  const newKey = joinKey(newFolder, name);
  if (newKey === typeKey) return { ok: false, reason: 'noop' };
  if (spec.types[newKey]) return { ok: false, reason: 'collision' };
  const next = renameType(spec, typeKey, newKey);
  await get().setSpec(next);
  return { ok: true };
},
async setEndpointFolder(endpointId: string, folder: string | null): Promise<{ ok: boolean; reason?: 'unknown' | 'noop' | 'collision' }> {
  const spec = get().spec;
  const idx = spec.endpoints.findIndex((e) => e.id === endpointId);
  if (idx < 0) return { ok: false, reason: 'unknown' };
  const current = spec.endpoints[idx]!;
  const nextFolder = folder ?? undefined;
  if ((current.folder ?? undefined) === nextFolder) return { ok: false, reason: 'noop' };
  // Endpoints don't collide by name within folder (only by id) — kept for parity.
  const nextEp = { ...current };
  if (nextFolder === undefined) delete nextEp.folder;
  else nextEp.folder = nextFolder;
  const endpoints = spec.endpoints.slice();
  endpoints[idx] = nextEp;
  await get().setSpec({ ...spec, endpoints });
  return { ok: true };
},
```

Update the `SpecStore` interface to match.

- [ ] **Step 2: Add i18n strings**

en:
```json
"dndCollisionMessage": "Can't move \"{{name}}\" to {{folder}} — a type with that name already exists there."
```

zh-TW:
```json
"dndCollisionMessage": "無法將「{{name}}」移到 {{folder}} — 該位置已有同名型別。"
```

- [ ] **Step 3: TypePanel — capture result + render alert**

In TypePanel.tsx, find the DnD `onDragEnd` handler. Replace `await setTypeFolder(...)` with capture + branch:

```tsx
const [dndAlert, setDndAlert] = useState<string | null>(null);
const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => () => { if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current); }, []);

async function handleDragEnd(event: DragEndEvent) {
  // ... existing logic to compute typeKey + dest folder ...
  const result = await setTypeFolder(typeKey, dest);
  if (!result.ok && result.reason === 'collision') {
    const { name } = splitKey(typeKey);
    setDndAlert(t('dndCollisionMessage', { name, folder: dest ?? '/' }));
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => setDndAlert(null), 4000);
  }
}
```

Render:

```tsx
{dndAlert && (
  <div role="alert" aria-live="polite" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
    {dndAlert}
  </div>
)}
```

- [ ] **Step 4: EndpointList parity** (same pattern; collision is unlikely for endpoints since they're keyed by id, but the no-op + unknown branches stay)

- [ ] **Step 5: Unit tests**

```ts
test('setTypeFolder returns { ok: false, reason: "collision" } when target key exists', async () => {
  const { setSpec, setTypeFolder } = useSpecStore.getState();
  await setSpec({
    ...emptySpec(),
    types: {
      'auth/User': { kind: 'object', fields: [] },
      'admin/User': { kind: 'object', fields: [] },
    },
  });
  const result = await useSpecStore.getState().setTypeFolder('auth/User', 'admin');
  expect(result).toEqual({ ok: false, reason: 'collision' });
  expect(useSpecStore.getState().spec.types['auth/User']).toBeDefined();
  expect(useSpecStore.getState().spec.types['admin/User']).toBeDefined();
});

test('setTypeFolder returns { ok: true } on success', async () => {
  // ... happy path ...
});
```

- [ ] **Step 6: Run web suite**

```bash
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/state/store.ts apps/web/src/ui/TypePanel.tsx apps/web/src/ui/EndpointList.tsx apps/web/src/i18n apps/web/tests/state/store.test.ts
git commit -m "$(cat <<'EOF'
feat(web): surface DnD collision feedback + return status from folder actions

setTypeFolder / setEndpointFolder now return { ok, reason } so the UI
can react. TypePanel + EndpointList show an aria-live amber banner for
4s when a drop collides with an existing type/endpoint name in the
destination folder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: zh-TW DnD announcements

**Files:**
- Create: `apps/web/src/ui/dndAnnouncements.ts`
- Modify: `apps/web/src/ui/TypePanel.tsx` — pass announcements to DndContext.
- Modify: `apps/web/src/ui/EndpointList.tsx` — same.
- Modify: `apps/web/src/ui/ExtendsPicker.tsx` — same.
- Modify: `apps/web/src/i18n/locales/{en,zh-TW}.json` — 6 announcement keys.
- Create: `apps/web/tests/ui/dndAnnouncements.test.ts` — locale test.

- [ ] **Step 1: i18n strings**

en (already English defaults; add for completeness):
```json
"dndAnnounceGrab": "Picked up {{id}}.",
"dndAnnounceMoveOver": "{{id}} is over {{over}}.",
"dndAnnounceMoveOverNothing": "{{id}} is no longer over a droppable area.",
"dndAnnounceDrop": "{{id}} was dropped over {{over}}.",
"dndAnnounceDropCancel": "{{id}} was dropped.",
"dndAnnounceMoveCancel": "Dragging was cancelled. {{id}} returned to its original position."
```

zh-TW:
```json
"dndAnnounceGrab": "已選取 {{id}}。",
"dndAnnounceMoveOver": "{{id}} 在 {{over}} 上方。",
"dndAnnounceMoveOverNothing": "{{id}} 不在任何可放置區域上方。",
"dndAnnounceDrop": "已將 {{id}} 放到 {{over}}。",
"dndAnnounceDropCancel": "{{id}} 已放下。",
"dndAnnounceMoveCancel": "已取消拖曳。{{id}} 回到原位。"
```

- [ ] **Step 2: Hook**

`apps/web/src/ui/dndAnnouncements.ts`:

```ts
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

export function useDndAnnouncements() {
  const { t } = useTranslation();
  return useMemo(() => ({
    onDragStart({ active }: { active: { id: string | number } }) {
      return t('dndAnnounceGrab', { id: String(active.id) });
    },
    onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      return over
        ? t('dndAnnounceMoveOver', { id: String(active.id), over: String(over.id) })
        : t('dndAnnounceMoveOverNothing', { id: String(active.id) });
    },
    onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      return over
        ? t('dndAnnounceDrop', { id: String(active.id), over: String(over.id) })
        : t('dndAnnounceDropCancel', { id: String(active.id) });
    },
    onDragCancel({ active }: { active: { id: string | number } }) {
      return t('dndAnnounceMoveCancel', { id: String(active.id) });
    },
  }), [t]);
}
```

- [ ] **Step 3: Wire into each DndContext**

For TypePanel, EndpointList, ExtendsPicker:

```tsx
const announcements = useDndAnnouncements();
// ...
<DndContext
  // ... existing props ...
  accessibility={{ announcements }}
>
```

- [ ] **Step 4: Test**

```ts
test('useDndAnnouncements returns localized strings', () => {
  // mock i18next to be in zh-TW
  // call the hook
  // verify onDragStart returns the zh-TW phrasing
});
```

(Use `i18n.changeLanguage('zh-TW')` in the test setup.)

- [ ] **Step 5: Run web suite**

```bash
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/dndAnnouncements.ts apps/web/src/ui/TypePanel.tsx apps/web/src/ui/EndpointList.tsx apps/web/src/ui/ExtendsPicker.tsx apps/web/src/i18n apps/web/tests/ui/dndAnnouncements.test.ts
git commit -m "$(cat <<'EOF'
feat(web): localize @dnd-kit screen-reader announcements (zh-TW)

useDndAnnouncements() returns localized callbacks; TypePanel,
EndpointList, and ExtendsPicker pass it via DndContext's
accessibility.announcements. zh-TW users now hear DnD events in zh-TW
instead of @dnd-kit's English defaults.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Keyboard-DnD e2e

**Files:**
- Create or modify: `apps/web/e2e/folders.spec.ts` (or new `keyboard-dnd.spec.ts`)

- [ ] **Step 1: Add a keyboard-DnD test**

Use the existing fixture pattern. Pseudocode:

```ts
test('keyboard-DnD: move a type from root into folder "b"', async ({ page }) => {
  // Open a fixture spec with type 'A' at root, folder 'b' present
  await openSpec(page, 'fixtures/keyboard-dnd.zwag.json');

  // Focus the 'A' row (use a stable selector — data-testid or aria-label)
  const aRow = page.getByTestId('type-row-A');
  await aRow.focus();

  // Grab
  await page.keyboard.press('Space');
  await expect(page.getByRole('alert')).toContainText(/Picked up A|已選取 A/);

  // Move down to folder 'b' header (number of arrows depends on layout)
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');

  // Drop
  await page.keyboard.press('Space');

  // Assert the spec store now has 'A' in folder 'b'
  const result = await page.evaluate(() => {
    return (window as any).__zwaggenStore?.getState?.()?.spec?.types?.['b/A'];
  });
  expect(result).toBeDefined();
});
```

If the existing e2e doesn't expose a store accessor, add one in test mode (similar to the test escape hatches already in use), OR assert via the visible UI (the row should now appear under folder 'b' in the panel).

If keyboard sequencing in headless Playwright is too fragile, document the issue in the test file with `test.skip(...)` and a TODO note. The plan accepts that as a degraded but documented outcome.

- [ ] **Step 2: Run the e2e**

```bash
pnpm --filter web e2e
```

(The exact command depends on the script — check `apps/web/package.json`. Might be `pnpm --filter web e2e:folders` or similar.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/
git commit -m "$(cat <<'EOF'
test(web): keyboard-DnD e2e for type folder move

Locks in the Space → ArrowDown → Space accessibility flow on TypePanel.
Pointer-DnD e2e stays — this is additive coverage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tick TODO + move spec/plan + final sweep

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Final sweep**

```bash
pnpm install
pnpm --filter @zwaggen/core test
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
pnpm --filter @zwaggen/desktop test
```

(Skip e2e here — already verified in Task 5.)

- [ ] **Step 2: Tick TODO entries**

Find and tick the 5 entries:
- Codegen v1.2 — symmetric inline-object expansion in `zodTypeExpr` (logged from v1.1)
- @dnd-kit zh-TW screen-reader announcements
- TYPE_PANEL_ROOT_ID / ENDPOINT_LIST_ROOT_ID sentinel collision
- setTypeFolder silent no-op
- Keyboard-DnD e2e

Each gets `[x]` with a brief description and a link to `docs/plans/done/2026-04-23-dnd-polish-and-codegen-v1.2.md`.

Update "Last updated" stamp.

- [ ] **Step 3: Move spec + plan to done/**

```bash
git mv docs/specs/active/2026-04-23-dnd-polish-and-codegen-v1.2.md docs/specs/done/
git mv docs/plans/active/2026-04-23-dnd-polish-and-codegen-v1.2.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship dnd-polish-and-codegen-v1.2 — tick 5 TODO entries

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 6 tasks ticked.
- Codegen v1.2 zodTypeExpr emits z.object for inline-object response shapes.
- DnD sentinels switched to `$$ROOT$$`; isValidSegment rejects.
- setTypeFolder / setEndpointFolder return status; UI surfaces collision feedback via aria-live banner.
- 4 DnD callbacks localized for zh-TW; en defaults preserved.
- One keyboard-DnD e2e test added (or skipped with documented reason).
- All test suites green; no new lint errors.
- Branch `plan/dnd-polish-and-codegen-v1.2` ready to push.

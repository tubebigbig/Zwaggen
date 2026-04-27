# Codegen export popover + 3-dot menu refactor (Slice 2A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-dot OverflowMenu on every endpoint, type, and folder row (plus the EndpointEditor header), and a new `<ExportPopover>` modal that emits cURL / TS / Zod / OpenAPI / JSON-Schema slices via Slice 1's codegen library.

**Architecture:** One shared `<MenuItem>` component, five surfaces wrapped in the existing `<OverflowMenu>`, and one new modal component (`<ExportPopover>`) that takes a `scope` prop and renders 3-or-4 tabs of generated output. `exportTarget` state lifted to `App.tsx`.

**Tech Stack:** React, vitest, the just-shipped `@zwaggen/core` codegen surface. No new deps.

---

### Spec

See `docs/specs/active/2026-04-24-codegen-export-popover.md`. Constraints:

- Reuse `OverflowMenu` (`apps/web/src/ui/OverflowMenu.tsx`) — already exists, tested, has click-outside + Escape.
- Modal shell mirrors `LoadErrorModal` (`apps/web/src/ui/LoadErrorModal.tsx`).
- Codegen calls go through `generateTs/Zod/Client(spec, { only })` and `toOpenApi(spec, { only })` — all available from `@zwaggen/core` after Slice 1.
- "Duplicate" item is a disabled placeholder.

---

### Task 1: `<MenuItem>` shared component + i18n keys

**Files:**
- Create: `apps/web/src/ui/MenuItem.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/zh-TW.json`

- [ ] **Step 1: Create `MenuItem.tsx`**

```tsx
import type { ReactNode, MouseEvent } from 'react';

interface Props {
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}

export function MenuItem({ onClick, disabled, danger, children }: Props) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm',
        'hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        danger ? 'text-red-700' : '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Add i18n keys to en.json**

Add these keys (near related entries — keep file alphabetical-ish where it already is):

```json
"exportFolder": "Export folder",
"duplicate": "Duplicate",
"comingSoon": "coming soon",
"livePreview": "Live preview",
"copyOutput": "Copy",
"downloadOutput": "Download",
"exportTabCurl": "cURL",
"exportTabTsClient": "TS client",
"exportTabOpenApiSnippet": "OpenAPI",
"exportTabTsInterface": "TS interface",
"exportTabZod": "Zod schema",
"exportTabJsonSchema": "JSON Schema",
"exportTabTypes": "types.ts",
"exportTabSchemas": "schemas.ts",
"exportTabClient": "client.ts",
"exportTabOpenApi": "openapi.json"
```

(`export`, `delete`, `copied` already exist — reuse.)

- [ ] **Step 3: zh-TW.json**

```json
"exportFolder": "匯出資料夾",
"duplicate": "複製",
"comingSoon": "即將推出",
"livePreview": "即時預覽",
"copyOutput": "複製",
"downloadOutput": "下載",
"exportTabCurl": "cURL",
"exportTabTsClient": "TS 客戶端",
"exportTabOpenApiSnippet": "OpenAPI",
"exportTabTsInterface": "TS 介面",
"exportTabZod": "Zod schema",
"exportTabJsonSchema": "JSON Schema",
"exportTabTypes": "types.ts",
"exportTabSchemas": "schemas.ts",
"exportTabClient": "client.ts",
"exportTabOpenApi": "openapi.json"
```

- [ ] **Step 4: Verify lint**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/codegen-export-ui
pnpm --filter web lint
```

Expected: green (the new component compiles, JSON files parse).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/MenuItem.tsx apps/web/src/i18n/locales
git commit -m "$(cat <<'EOF'
feat(web): MenuItem shared component + i18n keys for export menus

Foundation for the next steps that wrap five surfaces in OverflowMenu
+ MenuItem and add a new ExportPopover modal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 3-dot menu on EndpointEditor header

**Files:**
- Modify: `apps/web/src/ui/EndpointEditor.tsx` — header section (around lines 171–188).

- [ ] **Step 1: Read current header**

The standalone delete button is currently around lines 177–187. Note the existing `onDelete` prop name and any confirm flow.

- [ ] **Step 2: Replace with `<OverflowMenu>`**

Replace the standalone `<button onClick={onDelete}>` with:

```tsx
<OverflowMenu>
  <MenuItem onClick={() => onExport({ kind: 'endpoint', endpointId: endpoint.id })}>
    {t('export')}
  </MenuItem>
  <MenuItem disabled>
    {t('duplicate')}{' '}
    <span className="text-xs text-slate-400">({t('comingSoon')})</span>
  </MenuItem>
  <MenuItem onClick={onDelete} danger>
    {t('delete')}
  </MenuItem>
</OverflowMenu>
```

`onExport` is a NEW required prop on EndpointEditor, typed as `(target: ExportScope) => void`. Define `ExportScope` in a new file `apps/web/src/ui/ExportPopover.tsx` (Step coming in Task 5), or temporarily inline the type and refactor when ExportPopover lands.

For now (until Task 5 lands ExportPopover), you can stub the prop: `onExport?: (target: { kind: 'endpoint'; endpointId: string }) => void` — narrow type. Task 5/9 will widen it.

- [ ] **Step 3: Update parent (App.tsx) to pass `onExport`**

Pass a no-op temporarily: `onExport={() => {}}` so the prop is satisfied. Task 9 wires the real handler.

- [ ] **Step 4: Verify**

```bash
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green. Existing EndpointEditor tests should still pass — the menu just wraps the delete action; the action still fires.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/EndpointEditor.tsx apps/web/src/ui/App.tsx
git commit -m "$(cat <<'EOF'
feat(web): EndpointEditor header uses OverflowMenu (Export / Duplicate / Delete)

Replaces the standalone trash button with a 3-dot dropdown.
Export currently a no-op; wired in a later task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 3-dot menu on EndpointList rows (endpoint + folder)

**Files:**
- Modify: `apps/web/src/ui/EndpointList.tsx` — endpoint rows (around line 79–114) and folder rows (around line 415–495).

- [ ] **Step 1: Endpoint row menu**

Inside the row JSX (the existing button wrapping `<MethodBadge>` + path), wrap the row in a flex container so the menu can sit on the right. Be careful: the row IS the click target for selecting the endpoint. The menu's button must `stopPropagation` so opening the menu doesn't also select the endpoint.

```tsx
<div className="group relative flex items-center">
  <EndpointListItemButton ...existing>...</EndpointListItemButton>
  <div className="absolute right-1 opacity-0 group-hover:opacity-100">
    <OverflowMenu>
      <MenuItem onClick={(e) => { e.stopPropagation(); onExport({ kind: 'endpoint', endpointId: ep.id }); }}>
        {t('export')}
      </MenuItem>
      <MenuItem disabled>{t('duplicate')} <span className="text-xs text-slate-400">({t('comingSoon')})</span></MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); onDelete(ep.id); }} danger>{t('delete')}</MenuItem>
    </OverflowMenu>
  </div>
</div>
```

The OverflowMenu button itself must also stopPropagation; if the existing OverflowMenu doesn't already do this, wrap its trigger in a click-eater. Check `apps/web/src/ui/OverflowMenu.tsx` first.

- [ ] **Step 2: Folder row menu**

Folder rows already have the rename-pencil button (around line 478–486). Add an `<OverflowMenu>` next to it (or wrap both inside the existing right-side group).

```tsx
<OverflowMenu>
  <MenuItem onClick={() => onExport({ kind: 'folder', prefix: folderPath })}>
    {t('exportFolder')}
  </MenuItem>
  <MenuItem onClick={() => onRenameFolder(folderPath)}>{t('rename')}</MenuItem>
  <MenuItem onClick={() => onDeleteFolder(folderPath)} danger>{t('delete')}</MenuItem>
</OverflowMenu>
```

(If `rename`/`deleteFolder` callbacks aren't already props, leave Rename in the existing pencil position and only add Export folder + Delete folder to the menu. Implementer's call.)

- [ ] **Step 3: Verify**

```bash
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

Watch for keyboard-DnD e2e regressions (Space-grab on rows shouldn't trigger the menu). Existing `apps/web/tests/ui/EndpointList.*.test.tsx` files should still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/ui/EndpointList.tsx
git commit -m "$(cat <<'EOF'
feat(web): EndpointList rows + folders gain 3-dot menu

Each endpoint row shows Export / Duplicate (disabled) / Delete on
hover. Folder rows show Export folder / Rename / Delete folder.
Menu clicks stopPropagation to avoid triggering the row select.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 3-dot menu on TypePanel rows (type + folder)

**Files:**
- Modify: `apps/web/src/ui/TypePanel.tsx` — TypeRow (around line 477–498) and FolderRow (around line 500–571).

- [ ] **Step 1: Type row menu**

Mirror Task 3's pattern. Type rows are sortable (dnd-kit) and inside a slide-out panel — the menu's positioned popover must not get clipped.

```tsx
<div className="group relative flex items-center">
  <TypeRowButton ...>...</TypeRowButton>
  <div className="absolute right-1 opacity-0 group-hover:opacity-100">
    <OverflowMenu>
      <MenuItem onClick={(e) => { e.stopPropagation(); onExport({ kind: 'type', typeKey: typeKey }); }}>
        {t('export')}
      </MenuItem>
      <MenuItem disabled>{t('duplicate')} <span className="text-xs text-slate-400">({t('comingSoon')})</span></MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); onDeleteType(typeKey); }} danger>{t('delete')}</MenuItem>
    </OverflowMenu>
  </div>
</div>
```

If type deletion has a "type in use" guard (today's standalone delete button is disabled when in-use, line 352–360 of TypePanel), preserve that guard on the menu's Delete item too.

- [ ] **Step 2: Folder row menu**

Same pattern as endpoint folder rows.

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint

git add apps/web/src/ui/TypePanel.tsx
git commit -m "$(cat <<'EOF'
feat(web): TypePanel rows + folders gain 3-dot menu

Same shape as EndpointList. Type Delete preserves the existing
"type in use" guard; menu disables the item when the type is
referenced elsewhere.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `<ExportPopover>` shell (modal + tabs + Copy/Download)

**Files:**
- Create: `apps/web/src/ui/ExportPopover.tsx`
- Create: `apps/web/tests/ui/ExportPopover.shell.test.tsx`

This task lands the modal + tab UI + Copy/Download utilities WITHOUT any per-scope codegen yet. Each tab renders an empty `<pre>` placeholder; subsequent tasks fill in the per-scope outputs.

- [ ] **Step 1: ExportPopover shell**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';

export type ExportScope =
  | { kind: 'endpoint'; endpointId: string }
  | { kind: 'type'; typeKey: string }
  | { kind: 'folder'; prefix: string };

interface Props {
  scope: ExportScope;
  onClose: () => void;
}

interface Tab {
  id: string;
  label: string;
  output: string;
  filename: string;
}

export function ExportPopover({ scope, onClose }: Props) {
  const { t } = useTranslation();
  const spec = useSpecStore((s) => s.spec);

  const tabs: Tab[] = useMemo(() => buildTabs(scope, spec, t), [scope, spec, t]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id ?? '');
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-[min(800px,95vw)] flex-col overflow-hidden rounded-md bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-sm font-semibold">{titleFor(scope, t)}</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div role="tablist" className="flex gap-1 border-b border-slate-200 px-2 py-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={tab.id === active?.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`rounded px-2 py-1 text-xs ${tab.id === active?.id ? 'bg-slate-100 font-semibold' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {active && <Pane key={active.id} tab={active} />}
      </div>
    </div>
  );
}

function Pane({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tab.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    }
  }

  function download() {
    const blob = new Blob([tab.output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs">
        <button type="button" onClick={copy} className="btn">
          {copied ? t('copied') : t('copyOutput')}
        </button>
        <button type="button" onClick={download} className="btn">
          {t('downloadOutput')}
        </button>
        <span className="ml-auto text-slate-500">{tab.filename}</span>
      </div>
      <pre className="flex-1 overflow-auto bg-slate-50 px-3 py-2 text-xs">{tab.output}</pre>
      <textarea ref={fallbackRef} value={tab.output} readOnly className="sr-only" />
    </div>
  );
}

function titleFor(scope: ExportScope, t: (k: string) => string): string {
  if (scope.kind === 'endpoint') return `${t('export')}: ${scope.endpointId}`;
  if (scope.kind === 'type') return `${t('export')}: ${scope.typeKey}`;
  return `${t('exportFolder')}: ${scope.prefix}`;
}

function buildTabs(scope: ExportScope, spec: Spec, t: (k: string) => string): Tab[] {
  // STUB — Task 6/7/8 fill this in per scope.
  return [{ id: 'placeholder', label: 'TODO', output: '', filename: 'placeholder.txt' }];
}
```

(Adjust types — `Spec` import from `@zwaggen/core`. The `t` function signature might need `(k: string, opts?: any) => string` — match react-i18next's actual type.)

- [ ] **Step 2: Shell test (rendering only)**

```tsx
// apps/web/tests/ui/ExportPopover.shell.test.tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportPopover } from '../../src/ui/ExportPopover';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
});

it('renders a dialog with a close button', async () => {
  const onClose = vi.fn();
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={onClose} />);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /close/i }));
  expect(onClose).toHaveBeenCalled();
});

it('Escape closes the dialog', async () => {
  const onClose = vi.fn();
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={onClose} />);
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter web test
pnpm --filter web lint

git add apps/web/src/ui/ExportPopover.tsx apps/web/tests/ui/ExportPopover.shell.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): ExportPopover shell — modal + tabs + Copy/Download

Empty per-scope outputs for now; Tasks 6–8 fill in cURL / TS / Zod /
OpenAPI / JSON Schema slices via @zwaggen/core's resolveSlice.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Endpoint-scope export (cURL / TS client / OpenAPI)

**Files:**
- Modify: `apps/web/src/ui/ExportPopover.tsx` — fill `buildTabs` for `kind: 'endpoint'`.
- Create: `apps/web/tests/ui/ExportPopover.endpoint.test.tsx`

- [ ] **Step 1: Add the cURL placeholder-input helper**

Inline in ExportPopover (or in a sibling file `apps/web/src/ui/exportInputs.ts`):

```ts
import { resolveParamFields } from '@zwaggen/core';
import type { Spec, Endpoint } from '@zwaggen/core';

export function placeholderInputs(ep: Endpoint, spec: Spec) {
  const path: Record<string, string> = {};
  for (const p of ep.pathParams) path[p.name] = `{{${p.name}}}`;

  const query: Record<string, string> = {};
  for (const f of resolveParamFields(ep.queryParams, spec)) query[f.name] = `{{${f.name}}}`;

  const headers: Record<string, string> = {};
  for (const f of resolveParamFields(ep.headers, spec)) headers[f.name] = `{{${f.name}}}`;

  let body: unknown = undefined;
  if (ep.requestBody) body = '/* fill in */';
  // Form bodies left out of v1; add bodyForm placeholders if needed later.

  return { path, query, headers, body };
}
```

- [ ] **Step 2: `buildTabs` for endpoint scope**

```ts
import { buildRequest, toCurl, generateClient, toOpenApi } from '@zwaggen/core';

function buildTabs(scope: ExportScope, spec: Spec, t: (k: string) => string): Tab[] {
  if (scope.kind === 'endpoint') {
    const ep = spec.endpoints.find((e) => e.id === scope.endpointId);
    if (!ep) return [];
    const inputs = placeholderInputs(ep, spec);
    const built = buildRequest({ spec, endpoint: ep, baseUrl: spec.info.baseUrl ?? '', inputs, secrets: {}, useProxy: false });
    return [
      {
        id: 'curl', label: t('exportTabCurl'),
        output: toCurl(built),
        filename: `${ep.id}.curl.sh`,
      },
      {
        id: 'ts-client', label: t('exportTabTsClient'),
        output: generateClient(spec, { only: { endpointIds: [ep.id] } }),
        filename: `${ep.id}.ts`,
      },
      {
        id: 'openapi', label: t('exportTabOpenApiSnippet'),
        output: JSON.stringify(toOpenApi(spec, { only: { endpointIds: [ep.id] } }), null, 2),
        filename: `${ep.id}.openapi.json`,
      },
    ];
  }
  // type/folder return [] for now
  return [];
}
```

- [ ] **Step 3: Tests**

```tsx
// apps/web/tests/ui/ExportPopover.endpoint.test.tsx
it('endpoint scope renders cURL / TS client / OpenAPI tabs', async () => {
  const spec = emptySpec();
  spec.types['User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.endpoints = [{
    id: 'getUser', method: 'GET', path: '/users/:id',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  }];
  await useSpecStore.getState().replaceSpec(spec, null);

  render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={vi.fn()} />);

  expect(screen.getByRole('tab', { name: /curl/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /ts client/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /openapi/i })).toBeInTheDocument();

  // Default tab (cURL) should contain the path with the placeholder
  expect(screen.getByText(/\/users\/\{\{id\}\}/)).toBeInTheDocument();

  // Switch to TS client tab — output should contain the endpoint id and User
  await userEvent.click(screen.getByRole('tab', { name: /ts client/i }));
  expect(screen.getByText(/getUser/)).toBeInTheDocument();
  expect(screen.getByText(/User/)).toBeInTheDocument();
});
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter web test apps/web/tests/ui/ExportPopover.endpoint.test.tsx
pnpm --filter web lint

git add apps/web/src/ui/ExportPopover.tsx apps/web/tests/ui/ExportPopover.endpoint.test.tsx apps/web/src/ui/exportInputs.ts
git commit -m "$(cat <<'EOF'
feat(web): endpoint-scope export — cURL / TS client method / OpenAPI

cURL uses placeholder inputs ({{name}}) so the output is copy-paste
ready with explicit fill-in markers. TS + OpenAPI use Slice 1's
{ only: { endpointIds: [id] } } slice.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Type-scope export (TS interface / Zod / JSON Schema)

**Files:**
- Modify: `apps/web/src/ui/ExportPopover.tsx`
- Create: `apps/web/tests/ui/ExportPopover.type.test.tsx`

- [ ] **Step 1: `buildTabs` for type scope**

```ts
if (scope.kind === 'type') {
  const flatKey = scope.typeKey.replace(/\//g, '_');
  const tsOut = generateTs(spec, { only: { typeKeys: [scope.typeKey] } });
  const zodOut = generateZod(spec, { only: { typeKeys: [scope.typeKey] } });
  const oas = toOpenApi(spec, { only: { typeKeys: [scope.typeKey] } }) as { components?: { schemas?: Record<string, unknown> } };
  const fragment = oas.components?.schemas?.[flatKey];
  return [
    { id: 'ts', label: t('exportTabTsInterface'), output: tsOut, filename: `${flatKey}.ts` },
    { id: 'zod', label: t('exportTabZod'), output: zodOut, filename: `${flatKey}.schema.ts` },
    { id: 'json-schema', label: t('exportTabJsonSchema'), output: fragment ? JSON.stringify(fragment, null, 2) : '{}', filename: `${flatKey}.schema.json` },
  ];
}
```

- [ ] **Step 2: Tests**

```tsx
it('type scope renders TS / Zod / JSON Schema tabs', async () => {
  const spec = emptySpec();
  spec.types['User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  await useSpecStore.getState().replaceSpec(spec, null);

  render(<ExportPopover scope={{ kind: 'type', typeKey: 'User' }} onClose={vi.fn()} />);

  expect(screen.getByText(/interface User/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: /zod/i }));
  expect(screen.getByText(/UserSchema/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: /json schema/i }));
  expect(screen.getByText(/"properties"/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter web test apps/web/tests/ui/ExportPopover.type.test.tsx
pnpm --filter web lint

git add apps/web/src/ui/ExportPopover.tsx apps/web/tests/ui/ExportPopover.type.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): type-scope export — TS interface / Zod schema / JSON Schema

JSON Schema fragment is pulled out of toOpenApi(spec, { only })'s
components.schemas[flatKey].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Folder-scope export (4 tabs)

**Files:**
- Modify: `apps/web/src/ui/ExportPopover.tsx`
- Create: `apps/web/tests/ui/ExportPopover.folder.test.tsx`

- [ ] **Step 1: `buildTabs` for folder scope**

```ts
if (scope.kind === 'folder') {
  const only = { folderPrefix: scope.prefix };
  const folderName = scope.prefix.split('/').pop() ?? scope.prefix;
  return [
    { id: 'types', label: t('exportTabTypes'), output: generateTs(spec, { only }), filename: `${folderName}.types.ts` },
    { id: 'schemas', label: t('exportTabSchemas'), output: generateZod(spec, { only }), filename: `${folderName}.schemas.ts` },
    { id: 'client', label: t('exportTabClient'), output: generateClient(spec, { only }), filename: `${folderName}.client.ts` },
    { id: 'openapi', label: t('exportTabOpenApi'), output: JSON.stringify(toOpenApi(spec, { only }), null, 2), filename: `${folderName}.openapi.json` },
  ];
}
```

- [ ] **Step 2: Tests**

```tsx
it('folder scope renders 4 tabs with non-empty output', async () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.endpoints = [{
    id: 'getUser', method: 'GET', path: '/auth/user',
    pathParams: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'auth/User' } }],
    auth: 'inherit', useProxy: 'inherit', folder: 'auth',
  }];
  await useSpecStore.getState().replaceSpec(spec, null);

  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={vi.fn()} />);

  for (const label of [/types\.ts/, /schemas\.ts/, /client\.ts/, /openapi\.json/]) {
    expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
  }

  // Default tab (types.ts) — should contain the type name
  expect(screen.getByText(/auth_User/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: /openapi\.json/ }));
  expect(screen.getByText(/"\/auth\/user"/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter web test apps/web/tests/ui/ExportPopover.folder.test.tsx
pnpm --filter web lint

git add apps/web/src/ui/ExportPopover.tsx apps/web/tests/ui/ExportPopover.folder.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): folder-scope export — types/schemas/client/openapi tabs

Each tab generates a full file slice for everything under the folder
prefix. Filenames use the leaf segment of the prefix (e.g. 'oauth'
for 'auth/oauth').

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire menu items → ExportPopover state in App.tsx

**Files:**
- Modify: `apps/web/src/ui/App.tsx`

- [ ] **Step 1: Lift `exportTarget` state**

```tsx
const [exportTarget, setExportTarget] = useState<ExportScope | null>(null);

// pass setExportTarget to EndpointEditor / EndpointList / TypePanel as `onExport`

{exportTarget && (
  <ExportPopover scope={exportTarget} onClose={() => setExportTarget(null)} />
)}
```

- [ ] **Step 2: Replace the no-op `onExport` stubs from earlier tasks**

EndpointEditor, EndpointList, TypePanel: each now receives the real `onExport={setExportTarget}` instead of `() => {}`.

- [ ] **Step 3: Verify**

```bash
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

End-to-end test: Opening the menu on an endpoint row → clicking Export → the popover appears with the right scope. Add one e2e-ish test:

```tsx
// apps/web/tests/ui/exportPopover.integration.test.tsx
it('clicking Export on an endpoint row opens the popover with that endpoint', async () => {
  // Seed a spec with one endpoint, render <App />, hover the row, click the OverflowMenu, click Export, assert dialog shows endpoint id.
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/ui/App.tsx apps/web/src/ui/EndpointEditor.tsx apps/web/src/ui/EndpointList.tsx apps/web/src/ui/TypePanel.tsx apps/web/tests/ui/exportPopover.integration.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): wire 3-dot Export items to ExportPopover

App.tsx holds the exportTarget state; EndpointEditor / EndpointList
/ TypePanel pass setExportTarget as their onExport callback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Tick TODO + final smoke + move spec/plan

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan → `done/`

- [ ] **Step 1: Tick the three Export TODO entries**

The relevant lines (added with the auto-proxy-retry slice, currently around lines 89–92):

```
- [ ] Per-endpoint export — ...
- [ ] Per-type export — ...
- [ ] Folder export — ...
- [ ] Live codegen preview in the web app — ...
```

Tick the first three; leave the live preview entry open. Append a short note to each ticked entry pointing at this slice.

Update "Last updated" stamp to `2026-04-24 (codegen-export-popover)`.

- [ ] **Step 2: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-24-codegen-export-popover.md docs/specs/done/
git mv docs/plans/active/2026-04-24-codegen-export-popover.md docs/plans/done/
```

- [ ] **Step 3: Final smoke**

```bash
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/cli test
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship codegen-export-popover — tick 3 export TODOs, move spec/plan

Per-endpoint, per-type, and folder export ticked. Live codegen preview
stays open for Slice 2B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 10 tasks ticked.
- 5 surfaces show the new 3-dot menu with consistent items.
- ExportPopover supports endpoint / type / folder scopes with the right tab sets and right outputs.
- Copy + Download work in every tab.
- All existing tests pass.
- New tests cover each surface + each scope.
- i18n added in en + zh-TW.
- 3 TODO entries ticked; live preview entry left open for Slice 2B.
- Spec + plan moved to `done/`.
- Branch `plan/codegen-export-popover` ready to push.

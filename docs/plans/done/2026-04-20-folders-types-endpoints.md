# Folders for Types and Endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users nest Types and Endpoints into folders using path strings, with progressive opt-in rendering (flat today, tree once any item gets a folder) and OpenAPI round-trip via flattened keys + `x-folder`.

**Architecture:** Extend the spec with `Endpoint.folder?: string` and change `spec.types` keys from short names to full paths (`"auth/User"`). Derive folder structure from paths — no folder entity. Bump `schemaVersion` 1 → 2. Reuse the existing `renameType` ref-rewriting plumbing for atomic moves; add a `renameFolder` helper for bulk prefix rewrites. UI stays a zustand + React app — a new `groupByFolder` produces tree nodes for `TypePanel` and `EndpointList`.

**Tech Stack:** TypeScript, React 18, Zustand, Tailwind, Vitest, Playwright, react-i18next.

**Spec:** `docs/specs/active/2026-04-20-folders-types-endpoints.md`.

---

## File structure

**New files**
- `apps/web/src/schema/folders.ts` — path normalization, validation, key helpers.
- `apps/web/src/schema/groupByFolder.ts` — tree builder consumed by both sidebars.
- `apps/web/src/ui/FolderInput.tsx` — shared text input for the Folder field with inline validation.
- `apps/web/tests/schema/folders.test.ts`
- `apps/web/tests/schema/groupByFolder.test.ts`
- `apps/web/tests/ui/FolderInput.test.tsx`
- `apps/web/tests/ui/TypePanel.folders.test.tsx`
- `apps/web/tests/ui/EndpointList.folders.test.tsx`
- `apps/web/tests/ui/EndpointEditor.folder.test.tsx`
- `apps/web/tests/exporters/openapi.folders.test.ts`
- `apps/web/tests/importers/openapi.folders.test.ts`
- `apps/web/tests/exporters/jsonschema.folders.test.ts`
- `apps/web/e2e/folders.spec.ts`

**Modified files**
- `apps/web/src/schema/types.ts` — bump `CURRENT_SCHEMA_VERSION` to 2; add `folder?: string` to `Endpoint`.
- `apps/web/src/schema/serialize.ts` — accept v1 on read, upgrade to v2.
- `apps/web/src/schema/rename.ts` — add `renameFolder` + minor tweaks for path keys.
- `apps/web/src/state/uiPrefs.ts` — add `typeFolderCollapsed`, `endpointFolderCollapsed`; helpers `toggleTypeFolder`, `toggleEndpointFolder`.
- `apps/web/src/ui/TypePanel.tsx` — tree view when any key contains `/`; Folder input in editor; rename-folder action.
- `apps/web/src/ui/EndpointList.tsx` — tree view with priority fallback (folder → tag → flat).
- `apps/web/src/ui/EndpointEditor.tsx` — Folder input in metadata card.
- `apps/web/src/exporters/openapi.ts` — flatten schema keys, emit `x-folder`, rewrite `$ref`; emit `x-folder` on operations.
- `apps/web/src/importers/openapi.ts` — read `x-folder`, recover internal keys, rewrite refs.
- `apps/web/src/exporters/jsonschema.ts` — flatten `$defs` keys.
- `apps/web/src/exporters/markdown.ts` — folder headings.
- `apps/web/src/i18n/locales/en.json` + `zh-TW.json` — new labels.
- `apps/web/tests/exporters/bundle.test.ts` — round-trip fixture.

---

## Task 1: Bump schema version and accept v1 on load

**Files:**
- Modify: `apps/web/src/schema/types.ts:1`
- Modify: `apps/web/src/schema/serialize.ts:31-40`
- Modify: `apps/web/tests/schema/serialize.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/schema/serialize.test.ts` (inside the existing `describe('spec serialization', …)` block):

```ts
  test('upgrades a v1 spec to v2 on read (no-op payload)', () => {
    const raw = {
      schemaVersion: 1,
      info: { name: 'legacy' },
      types: { User: { kind: 'object', fields: [] } },
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [],
    };
    const parsed = fromJSON(raw);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.types.User).toEqual({ kind: 'object', fields: [] });
  });

  test('rejects a v3 (unknown future) spec', () => {
    expect(() => fromJSON({ schemaVersion: 3, info: { name: 'x' } })).toThrow(SpecVersionError);
  });
```

- [ ] **Step 2: Run tests to verify the upgrade test fails**

Run: `pnpm --filter @zwaggen/web test tests/schema/serialize.test.ts`
Expected: FAIL with `SpecVersionError` because today's loader rejects anything that isn't the current version.

- [ ] **Step 3: Implement the bump and upgrade path**

Edit `apps/web/src/schema/types.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 2 as const;
```

Edit `apps/web/src/schema/serialize.ts` — replace the body of `fromJSON`:

```ts
export function fromJSON(raw: unknown): Spec {
  if (typeof raw !== 'object' || raw === null) throw new SpecVersionError(undefined);
  const obj = raw as Record<string, unknown>;
  const v = obj.schemaVersion;
  if (v === 1) {
    // v1 → v2: no data translation — absent folder fields already mean "root folder".
    return { ...(obj as unknown as Spec), schemaVersion: CURRENT_SCHEMA_VERSION };
  }
  if (v !== CURRENT_SCHEMA_VERSION) throw new SpecVersionError(v);
  return obj as unknown as Spec;
}
```

- [ ] **Step 4: Verify all serialize tests pass**

Run: `pnpm --filter @zwaggen/web test tests/schema/serialize.test.ts`
Expected: all green, including the two new tests.

- [ ] **Step 5: Update the spec-versioning rule doc**

Edit `docs/rules/spec-versioning.md` — change `**Current version:** \`1\`.` to `**Current version:** \`2\`.` and add a line under it:

```markdown
- **v1 → v2 (2026-04-20):** added folder support for types and endpoints. v1 specs load unchanged because absent folder fields mean root folder; the loader stamps `schemaVersion: 2` on read.
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/schema/types.ts apps/web/src/schema/serialize.ts apps/web/tests/schema/serialize.test.ts docs/rules/spec-versioning.md
git commit -m "feat(schema): bump spec schemaVersion 1 → 2 with silent upgrade" -m "" -m "v1 → v2 adds folder support for types and endpoints. Absent folder fields mean root folder, so no data translation is needed on upgrade." -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `folder` field to the Endpoint type

**Files:**
- Modify: `apps/web/src/schema/types.ts:89-104`

- [ ] **Step 1: Edit `Endpoint` interface**

Locate the `Endpoint` interface (around line 89 of `apps/web/src/schema/types.ts`) and add one field:

```ts
export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];
  queryParams: ParamDef[];
  headers: ParamDef[];
  requestBody: TypeDef | null;
  responses: ResponseDef[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
  tags?: string[];
  folder?: string;
  assertions?: Assertions;
  captures?: Capture[];
}
```

- [ ] **Step 2: Run the full typecheck + test suite**

Run: `pnpm --filter @zwaggen/web lint && pnpm --filter @zwaggen/web test`
Expected: all green. The field is optional so existing tests and fixtures are untouched.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/schema/types.ts
git commit -m "feat(schema): add optional Endpoint.folder field" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Path utilities (`schema/folders.ts`)

**Files:**
- Create: `apps/web/src/schema/folders.ts`
- Create: `apps/web/tests/schema/folders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/schema/folders.test.ts`:

```ts
import { expect, test, describe } from 'vitest';
import {
  normalizeFolder,
  isValidSegment,
  splitKey,
  joinKey,
  childOf,
} from '../../src/schema/folders';

describe('normalizeFolder', () => {
  test('trims, collapses //, strips leading and trailing /', () => {
    expect(normalizeFolder('  /auth//admin/  ')).toBe('auth/admin');
  });

  test('empty / whitespace / single slash → undefined', () => {
    expect(normalizeFolder('')).toBeUndefined();
    expect(normalizeFolder('   ')).toBeUndefined();
    expect(normalizeFolder('/')).toBeUndefined();
    expect(normalizeFolder('///')).toBeUndefined();
  });

  test('preserves mixed-case and allowed punctuation', () => {
    expect(normalizeFolder('Auth.v1/admin-tools')).toBe('Auth.v1/admin-tools');
  });

  test('rejects a segment with disallowed chars by returning null', () => {
    expect(normalizeFolder('auth/bad?segment')).toBeNull();
    expect(normalizeFolder('auth/bad\\seg')).toBeNull();
  });
});

describe('isValidSegment', () => {
  test('accepts letters, digits, underscore, dot, dash, space', () => {
    expect(isValidSegment('Hello_World.v2-beta 1')).toBe(true);
  });
  test('rejects slashes and other punctuation', () => {
    expect(isValidSegment('a/b')).toBe(false);
    expect(isValidSegment('a?b')).toBe(false);
    expect(isValidSegment('')).toBe(false);
  });
});

describe('splitKey / joinKey', () => {
  test('splitKey("auth/admin/User") → { folder: "auth/admin", name: "User" }', () => {
    expect(splitKey('auth/admin/User')).toEqual({ folder: 'auth/admin', name: 'User' });
  });

  test('splitKey("User") → { folder: undefined, name: "User" }', () => {
    expect(splitKey('User')).toEqual({ folder: undefined, name: 'User' });
  });

  test('joinKey respects undefined folder', () => {
    expect(joinKey(undefined, 'User')).toBe('User');
    expect(joinKey('', 'User')).toBe('User');
    expect(joinKey('auth', 'User')).toBe('auth/User');
    expect(joinKey('auth/admin', 'User')).toBe('auth/admin/User');
  });
});

describe('childOf', () => {
  test('recognizes direct and deep children of a folder prefix', () => {
    expect(childOf('auth/User', 'auth')).toBe(true);
    expect(childOf('auth/admin/User', 'auth')).toBe(true);
  });
  test('does not confuse prefixes that share a segment boundary', () => {
    expect(childOf('authority/User', 'auth')).toBe(false);
    expect(childOf('User', 'auth')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/schema/folders.test.ts`
Expected: FAIL — module `../../src/schema/folders` does not exist.

- [ ] **Step 3: Implement the utility**

Create `apps/web/src/schema/folders.ts`:

```ts
const SEGMENT = /^[A-Za-z0-9_. -]+$/;

export function isValidSegment(s: string): boolean {
  return SEGMENT.test(s);
}

/**
 * Returns:
 *   string  — a canonical path with no leading/trailing slash and no empty segments.
 *   undefined — the input means "no folder" (empty, whitespace, or slash-only).
 *   null    — contains an invalid segment.
 */
export function normalizeFolder(raw: string): string | undefined | null {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const segments = trimmed.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length === 0) return undefined;
  for (const s of segments) {
    if (!isValidSegment(s)) return null;
  }
  return segments.join('/');
}

export function splitKey(key: string): { folder: string | undefined; name: string } {
  const i = key.lastIndexOf('/');
  if (i < 0) return { folder: undefined, name: key };
  return { folder: key.slice(0, i), name: key.slice(i + 1) };
}

export function joinKey(folder: string | undefined, name: string): string {
  if (!folder) return name;
  return `${folder}/${name}`;
}

/** True if `key`'s folder equals `prefix` or is a descendant (sibling-prefix-safe). */
export function childOf(key: string, prefix: string): boolean {
  const { folder } = splitKey(key);
  if (!folder) return false;
  return folder === prefix || folder.startsWith(`${prefix}/`);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @zwaggen/web test tests/schema/folders.test.ts`
Expected: all 12 cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/schema/folders.ts apps/web/tests/schema/folders.test.ts
git commit -m "feat(schema): add folder path utilities (normalize, split, join, childOf)" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Bulk folder rename in `rename.ts`

**Files:**
- Modify: `apps/web/src/schema/rename.ts:62-83`
- Modify: `apps/web/tests/schema/rename.test.ts`

The existing `renameType(spec, from, to)` already works on arbitrary string keys — moving `auth/User` → `admin/User` is just two-arg rename. We add `renameFolder` for the common case of rewriting every descendant of a folder at once.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/schema/rename.test.ts`:

```ts
import { renameFolder } from '../../src/schema/rename';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/schema/rename.test.ts`
Expected: FAIL — `renameFolder` is not exported.

- [ ] **Step 3: Implement `renameFolder`**

Append to `apps/web/src/schema/rename.ts`:

```ts
import { childOf, splitKey, joinKey } from './folders';

/**
 * Bulk-rewrite every type key, type ref, and endpoint.folder whose path is
 * `oldFolder` or a descendant, producing an equivalent spec under `newFolder`.
 *
 * Implemented as a sequence of single-key `renameType` calls so ref rewriting
 * reuses the existing plumbing. A no-op if nothing matches.
 */
export function renameFolder(spec: Spec, oldFolder: string, newFolder: string): Spec {
  if (oldFolder === newFolder || !oldFolder) return spec;

  // 1. Types: collect every key whose folder prefix matches, build the target key.
  //    Sort by path depth descending so we rename leaves first — avoids transient
  //    collisions when old/new prefixes overlap. Then for each, compute the new
  //    key by swapping the prefix and call renameType.
  const keys = Object.keys(spec.types).filter((k) => {
    const { folder } = splitKey(k);
    return folder === oldFolder || (folder != null && folder.startsWith(`${oldFolder}/`));
  });
  keys.sort((a, b) => b.split('/').length - a.split('/').length);

  let out = spec;
  for (const oldKey of keys) {
    const { folder, name } = splitKey(oldKey);
    const newSubFolder = folder === oldFolder
      ? newFolder
      : newFolder + folder!.slice(oldFolder.length); // preserves the suffix after oldFolder
    const newKey = joinKey(newSubFolder, name);
    out = renameType(out, oldKey, newKey);
  }

  // 2. Endpoints: rewrite `folder` on every matching endpoint.
  out = {
    ...out,
    endpoints: out.endpoints.map((e) => {
      if (!e.folder) return e;
      if (e.folder === oldFolder) return { ...e, folder: newFolder };
      if (e.folder.startsWith(`${oldFolder}/`)) {
        return { ...e, folder: newFolder + e.folder.slice(oldFolder.length) };
      }
      return e;
    }),
  };

  return out;
}

// `childOf` is re-exported so the UI can share the same predicate; not used internally here.
export { childOf };
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @zwaggen/web test tests/schema/rename.test.ts`
Expected: all 5 cases green (2 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/schema/rename.ts apps/web/tests/schema/rename.test.ts
git commit -m "feat(schema): add renameFolder for bulk path + ref rewrites" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `groupByFolder` tree builder

**Files:**
- Create: `apps/web/src/schema/groupByFolder.ts`
- Create: `apps/web/tests/schema/groupByFolder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/schema/groupByFolder.test.ts`:

```ts
import { expect, test } from 'vitest';
import { groupByFolder, FolderNode } from '../../src/schema/groupByFolder';

interface Item { id: string; folder?: string }

test('flat input with no folders → every item at root', () => {
  const items: Item[] = [{ id: 'A' }, { id: 'B' }];
  const root = groupByFolder(items, (i) => i.folder);
  expect(root.items.map((i) => i.id)).toEqual(['A', 'B']);
  expect(root.children).toEqual([]);
});

test('nested folders produce a tree sorted alphabetically at each level', () => {
  const items: Item[] = [
    { id: '1', folder: 'zeta' },
    { id: '2', folder: 'alpha/nested' },
    { id: '3' },                        // root
    { id: '4', folder: 'alpha' },
  ];
  const root = groupByFolder(items, (i) => i.folder);
  expect(root.items.map((i) => i.id)).toEqual(['3']);
  expect(root.children.map((c) => c.name)).toEqual(['alpha', 'zeta']);

  const alpha = root.children[0]!;
  expect(alpha.path).toBe('alpha');
  expect(alpha.items.map((i) => i.id)).toEqual(['4']);
  expect(alpha.children.map((c) => c.name)).toEqual(['nested']);

  const nested = alpha.children[0]!;
  expect(nested.path).toBe('alpha/nested');
  expect(nested.items.map((i) => i.id)).toEqual(['2']);
});

test('items inside a folder preserve insertion order', () => {
  const items: Item[] = [
    { id: 'c', folder: 'x' },
    { id: 'a', folder: 'x' },
    { id: 'b', folder: 'x' },
  ];
  const root = groupByFolder(items, (i) => i.folder);
  expect(root.children[0]!.items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
});

test('FolderNode exposes a totalCount across descendants', () => {
  const items: Item[] = [
    { id: '1', folder: 'a' },
    { id: '2', folder: 'a/b' },
    { id: '3', folder: 'a/b/c' },
  ];
  const root = groupByFolder(items, (i) => i.folder);
  const a = root.children[0]!;
  expect(a.totalCount).toBe(3);
  expect(a.children[0]!.totalCount).toBe(2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/schema/groupByFolder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tree builder**

Create `apps/web/src/schema/groupByFolder.ts`:

```ts
export interface FolderNode<T> {
  /** Final segment of this folder's path. Empty for the virtual root. */
  name: string;
  /** Full slash-joined path from root. Empty for the virtual root. */
  path: string;
  /** Items whose folder equals this node's path, in input order. */
  items: T[];
  /** Child folders, sorted alphabetically by name. */
  children: FolderNode<T>[];
  /** Items in this node + all descendants. */
  totalCount: number;
}

export function groupByFolder<T>(
  items: T[],
  getFolder: (item: T) => string | undefined,
): FolderNode<T> {
  const root: FolderNode<T> = { name: '', path: '', items: [], children: [], totalCount: 0 };

  function ensure(segments: string[]): FolderNode<T> {
    let node = root;
    let pathAcc = '';
    for (const seg of segments) {
      pathAcc = pathAcc ? `${pathAcc}/${seg}` : seg;
      let next = node.children.find((c) => c.name === seg);
      if (!next) {
        next = { name: seg, path: pathAcc, items: [], children: [], totalCount: 0 };
        node.children.push(next);
      }
      node = next;
    }
    return node;
  }

  for (const item of items) {
    const folder = getFolder(item);
    if (!folder) {
      root.items.push(item);
    } else {
      ensure(folder.split('/')).items.push(item);
    }
  }

  const sortAndCount = (node: FolderNode<T>): number => {
    node.children.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    let total = node.items.length;
    for (const c of node.children) total += sortAndCount(c);
    node.totalCount = total;
    return total;
  };
  sortAndCount(root);
  return root;
}
```

- [ ] **Step 4: Verify the tests pass**

Run: `pnpm --filter @zwaggen/web test tests/schema/groupByFolder.test.ts`
Expected: all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/schema/groupByFolder.ts apps/web/tests/schema/groupByFolder.test.ts
git commit -m "feat(schema): groupByFolder tree builder for types + endpoints" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: UI prefs — folder collapse state

**Files:**
- Modify: `apps/web/src/state/uiPrefs.ts:3-16, 61-64`

- [ ] **Step 1: Extend `UiPrefs` and defaults**

Edit `apps/web/src/state/uiPrefs.ts`. Replace the type and defaults block (lines 3-16):

```ts
export type UiPrefs = {
  typesCollapsed: boolean;
  endpointsCollapsed: boolean;
  sidebarCollapsed: boolean;
  endpointGroupCollapsed: Record<string, boolean>;
  typeFolderCollapsed: Record<string, boolean>;
  endpointFolderCollapsed: Record<string, boolean>;
};

const KEY = 'zwaggen.ui.prefs.v1';
const DEFAULTS: UiPrefs = {
  typesCollapsed: true,
  endpointsCollapsed: false,
  sidebarCollapsed: false,
  endpointGroupCollapsed: {},
  typeFolderCollapsed: {},
  endpointFolderCollapsed: {},
};
```

Then, below the existing `toggleEndpointGroup` helper, add:

```ts
export function toggleTypeFolder(path: string) {
  const cur = state.typeFolderCollapsed ?? {};
  setUiPref('typeFolderCollapsed', { ...cur, [path]: !cur[path] });
}

export function toggleEndpointFolder(path: string) {
  const cur = state.endpointFolderCollapsed ?? {};
  setUiPref('endpointFolderCollapsed', { ...cur, [path]: !cur[path] });
}
```

- [ ] **Step 2: Run the full test suite for regressions**

Run: `pnpm --filter @zwaggen/web test`
Expected: all existing tests green. (Two new fields have safe defaults and no behavior change.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/state/uiPrefs.ts
git commit -m "feat(ui): add typeFolderCollapsed + endpointFolderCollapsed prefs" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Shared `FolderInput` component + i18n labels

**Files:**
- Create: `apps/web/src/ui/FolderInput.tsx`
- Create: `apps/web/tests/ui/FolderInput.test.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/zh-TW.json`

- [ ] **Step 1: Add locale keys**

Append these keys (they're sorted by insertion order — the app's current en.json has no alphabetical sort rule) near the `"tags"` entries in both files.

In `apps/web/src/i18n/locales/en.json`:

```json
  "folder": "Folder",
  "folderPlaceholder": "auth/admin (leave blank for root)",
  "folderInvalid": "Invalid folder — use letters, digits, _ . - or spaces in each segment, separated by /",
  "renameFolder": "Rename folder",
  "rootFolder": "Root",
```

In `apps/web/src/i18n/locales/zh-TW.json`:

```json
  "folder": "資料夾",
  "folderPlaceholder": "auth/admin（留空為根目錄）",
  "folderInvalid": "資料夾無效——每段僅能使用字母、數字、_ . - 或空格，以 / 分隔",
  "renameFolder": "重新命名資料夾",
  "rootFolder": "根目錄",
```

- [ ] **Step 2: Write the failing component test**

Create `apps/web/tests/ui/FolderInput.test.tsx`:

```tsx
import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderInput } from '../../src/ui/FolderInput';

test('commits a normalized path on blur', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FolderInput value={undefined} onChange={onChange} />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.type(input, '  /auth//admin/  ');
  await user.tab();
  expect(onChange).toHaveBeenCalledWith('auth/admin');
});

test('commits undefined for empty input', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FolderInput value="auth" onChange={onChange} />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.tab();
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test('shows inline error and does not commit on invalid input', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FolderInput value="auth" onChange={onChange} />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.type(input, 'bad?seg');
  await user.tab();
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('Escape reverts the input to the initial value', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FolderInput value="auth" onChange={onChange} />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.type(input, 'temp');
  await user.keyboard('{Escape}');
  expect(input.value).toBe('auth');
  expect(onChange).not.toHaveBeenCalled();
});
```

(The repo's `tests/setup.ts` already wires `@testing-library/jest-dom` globally. The file above just needs the imports shown at the top — no extra setup inside this spec file.)

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/ui/FolderInput.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the component**

Create `apps/web/src/ui/FolderInput.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeFolder } from '../schema/folders';

interface Props {
  value: string | undefined;
  onChange(next: string | undefined): void;
  /** If provided, overrides the default 'Folder' aria-label. */
  labelText?: string;
  className?: string;
}

export function FolderInput({ value, onChange, labelText, className }: Props) {
  const { t } = useTranslation();
  const [buffer, setBuffer] = useState<string>(value ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBuffer(value ?? '');
    setError(null);
  }, [value]);

  function commit() {
    const result = normalizeFolder(buffer);
    if (result === null) {
      setError(t('folderInvalid'));
      return;
    }
    setError(null);
    if (result !== value) onChange(result);
    setBuffer(result ?? '');
  }

  return (
    <div className={className}>
      <label className="block">
        <span className="text-xs text-slate-500">{labelText ?? t('folder')}</span>
        <input
          aria-label={labelText ?? t('folder')}
          className="input mt-1 font-mono text-xs"
          placeholder={t('folderPlaceholder')}
          value={buffer}
          onChange={(e) => { setBuffer(e.target.value); if (error) setError(null); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') {
              e.preventDefault();
              setBuffer(value ?? '');
              setError(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </label>
      {error && (
        <div role="alert" className="mt-1 text-[11px] text-red-600">{error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm --filter @zwaggen/web test tests/ui/FolderInput.test.tsx`
Expected: all 4 cases green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/FolderInput.tsx apps/web/tests/ui/FolderInput.test.tsx apps/web/src/i18n/locales/en.json apps/web/src/i18n/locales/zh-TW.json
git commit -m "feat(ui): FolderInput with validate-on-blur + i18n labels" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: TypePanel tree rendering

**Files:**
- Modify: `apps/web/src/ui/TypePanel.tsx:10-210`
- Create: `apps/web/tests/ui/TypePanel.folders.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/ui/TypePanel.folders.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypePanel } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import { setUiPref } from '../../src/state/uiPrefs';

beforeEach(() => {
  setUiPref('typesCollapsed', false);
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: {
        'Order': { kind: 'object', fields: [] },
        'auth/User': { kind: 'object', fields: [] },
        'auth/admin/Session': { kind: 'object', fields: [] },
      },
    },
    fileHandle: null,
    dirty: false,
  });
});

test('renders a folder tree when any type has a slash in its key', () => {
  render(<TypePanel />);
  // root-level type visible at the top
  expect(screen.getByRole('button', { name: /Order/ })).toBeInTheDocument();
  // folder nodes rendered
  expect(screen.getByRole('button', { name: /auth/ })).toBeInTheDocument();
  // nested items reachable after expanding
  expect(screen.getByRole('button', { name: /User/ })).toBeInTheDocument();
});

test('falls back to the flat list when no type has a folder', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: { A: { kind: 'object', fields: [] }, B: { kind: 'object', fields: [] } },
    },
  });
  render(<TypePanel />);
  expect(screen.queryByRole('button', { name: /Rename folder/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^A$/ })).toBeInTheDocument();
});

test('renaming a folder via inline action rewrites all descendant type keys', async () => {
  const user = userEvent.setup();
  render(<TypePanel />);
  // Hover-less fallback: the Rename folder button is always in the DOM; it's visually hover-revealed but findable by aria-label.
  const rename = screen.getAllByRole('button', { name: /Rename folder/ })[0]!;
  await user.click(rename);
  const input = screen.getByRole('textbox', { name: /Rename folder/ });
  await user.clear(input);
  await user.type(input, 'identity');
  await user.keyboard('{Enter}');
  expect(useSpecStore.getState().spec.types['identity/User']).toBeDefined();
  expect(useSpecStore.getState().spec.types['auth/User']).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/ui/TypePanel.folders.test.tsx`
Expected: FAIL — current TypePanel renders a flat list only.

- [ ] **Step 3: Implement tree rendering in TypePanel**

Replace the body of `apps/web/src/ui/TypePanel.tsx` — keep the existing dialog chrome/collapsed-rail frame, only change the list region (lines 111-140 in the current file) and add rename-folder wiring. Full replacement for the file:

```tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { TypeBuilder } from './TypeBuilder';
import { renameType, renameFolder, collectBrokenRefs, buildUsageIndex } from '../schema/rename';
import { groupByFolder, type FolderNode } from '../schema/groupByFolder';
import { splitKey, joinKey, normalizeFolder } from '../schema/folders';
import { IconAlert, IconChevronDown, IconChevronRight, IconCube, IconPlus, IconTrash, IconX } from './icons';
import { setUiPref, toggleTypeFolder, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';
import { FolderInput } from './FolderInput';

interface TypeItem { key: string; folder: string | undefined; name: string }

export function TypePanel() {
  const { t } = useTranslation();
  const { spec, setSpec, selectEndpoint } = useSpecStore();
  const { typesCollapsed, typeFolderCollapsed } = useUiPrefs();
  const typeKeys = Object.keys(spec.types).sort();
  const anyInFolder = typeKeys.some((k) => k.includes('/'));

  const items: TypeItem[] = useMemo(() =>
    typeKeys.map((k) => { const s = splitKey(k); return { key: k, folder: s.folder, name: s.name }; }),
    [typeKeys.join('|')]);

  const tree = useMemo(() => groupByFolder(items, (i) => i.folder), [items]);

  const [selected, setSelected] = useState<string | null>(typeKeys[0] ?? null);
  const broken = collectBrokenRefs(spec);
  const usageIndex = useMemo(() => buildUsageIndex(spec), [spec]);
  const usages = selected ? (usageIndex[selected] ?? []) : [];

  useEffect(() => {
    if (typesCollapsed) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setUiPref('typesCollapsed', true); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typesCollapsed]);

  async function addType() {
    // New type always lands at root with a generated unique short name.
    let name = 'NewType'; let i = 1;
    while (spec.types[name]) name = `NewType${i++}`;
    await setSpec({ ...spec, types: { ...spec.types, [name]: { kind: 'object', fields: [] } } });
    setSelected(name);
  }

  async function renameTypeKey(oldKey: string, newKey: string) {
    if (!newKey || spec.types[newKey]) return;
    await setSpec(renameType(spec, oldKey, newKey));
    setSelected(newKey);
  }

  async function moveToFolder(oldKey: string, nextFolder: string | undefined) {
    const { name } = splitKey(oldKey);
    const newKey = joinKey(nextFolder, name);
    if (newKey === oldKey) return;
    if (spec.types[newKey]) return; // collision — silently no-op; UI could surface a toast later.
    await renameTypeKey(oldKey, newKey);
  }

  async function handleRenameFolder(oldFolder: string, rawNext: string) {
    const normalized = normalizeFolder(rawNext);
    if (normalized === null) return; // invalid, rejected by FolderInput UI
    const next = normalized ?? ''; // empty means "move everything to root"
    if (next === oldFolder) return;
    await setSpec(renameFolder(spec, oldFolder, next));
  }

  async function removeType(key: string) {
    if ((usageIndex[key] ?? []).length > 0) return;
    const { [key]: _, ...rest } = spec.types;
    await setSpec({ ...spec, types: rest });
    if (selected === key) setSelected(Object.keys(rest)[0] ?? null);
  }

  const current = selected ? spec.types[selected] : null;
  const selectedParts = selected ? splitKey(selected) : null;

  return (
    <>
      <CollapsedRail
        label={t('types')}
        icon={<IconCube />}
        side="left"
        onExpand={() => setUiPref('typesCollapsed', false)}
        count={typeKeys.length}
      />

      {!typesCollapsed && (
        <>
          <div className="absolute inset-0 z-20 bg-slate-900/10" onClick={() => setUiPref('typesCollapsed', true)} aria-hidden="true" />
          <section className="absolute left-10 top-0 bottom-0 z-30 flex w-[440px] max-w-[calc(100vw-4rem)] flex-col rounded-r-lg border-y border-r border-slate-200 bg-white shadow-pop text-sm" role="dialog" aria-label={t('types')}>
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <h2 className="panel-title">{t('types')}</h2>
              <div className="flex items-center gap-1">
                <button className="btn-icon" aria-label={t('addTypeTitle')} title={t('addTypeTitle')} onClick={() => void addType()}>
                  <IconPlus />
                </button>
                <button className="btn-icon" aria-label={t('closeTypes')} title={t('closeTypesHint')} onClick={() => setUiPref('typesCollapsed', true)}>
                  <IconX />
                </button>
              </div>
            </div>

            <div className="thin-scroll flex-1 overflow-y-auto p-3">
              {broken.length > 0 && (
                <div role="alert" className="mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  <IconAlert className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold">{broken.length} {t('brokenRefs')}</div>
                    <ul className="mt-1 space-y-0.5">
                      {broken.map((b, i) => (<li key={i}><span className="font-mono">{b.location}</span>: {b.ref}</li>))}
                    </ul>
                  </div>
                </div>
              )}

              {typeKeys.length === 0 ? (
                <EmptyState t={t} />
              ) : anyInFolder ? (
                <TreeList
                  node={tree}
                  depth={0}
                  selected={selected}
                  onSelect={setSelected}
                  collapsed={typeFolderCollapsed}
                  onToggleFolder={toggleTypeFolder}
                  onRenameFolder={(p, next) => void handleRenameFolder(p, next)}
                />
              ) : (
                <FlatList keys={typeKeys} selected={selected} onSelect={setSelected} />
              )}

              {selected && current && selectedParts && (
                <div className="mt-3 space-y-2">
                  <FolderInput
                    value={selectedParts.folder}
                    onChange={(next) => void moveToFolder(selected, next)}
                  />
                  <div className="flex gap-2">
                    <input
                      key={selected}
                      aria-label="Type name"
                      className="input flex-1 font-mono text-xs"
                      defaultValue={selectedParts.name}
                      onBlur={(e) => void renameTypeKey(selected, joinKey(selectedParts.folder, e.target.value))}
                    />
                    <button
                      className="btn-icon text-red-600 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed"
                      aria-label="delete"
                      title={usages.length > 0 ? t('deleteTypeBlocked', { count: usages.length }) : t('deleteType')}
                      disabled={usages.length > 0}
                      onClick={() => void removeType(selected)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                  {usages.length > 0 && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      <div className="mb-1 font-medium text-slate-600">{t('referencedBy', { count: usages.length })}</div>
                      <ul className="space-y-0.5" aria-label={t('referencedBy', { count: usages.length })}>
                        {usages.map((u) => {
                          const key = u.kind === 'endpoint' ? `ep:${u.endpointId}:${u.label}` : `ty:${u.typeName}:${u.label}`;
                          return (
                            <li key={key}>
                              <button
                                className="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] text-slate-700 hover:bg-white hover:text-brand-700"
                                onClick={() => {
                                  if (u.kind === 'endpoint') { selectEndpoint(u.endpointId); setUiPref('typesCollapsed', true); }
                                  else { setSelected(u.typeName); }
                                }}
                              >{u.label}</button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <TypeBuilder
                    value={current}
                    onChange={(t2) => void setSpec({ ...spec, types: { ...spec.types, [selected]: t2 } })}
                    typeNames={typeKeys.filter((n) => n !== selected)}
                  />
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function EmptyState({ t }: { t: ReturnType<typeof useTranslation>['t'] }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"><IconCube /></div>
      <p className="text-xs text-slate-500">{t('noTypesYet')}</p>
      <p className="text-[11px] text-slate-400">{t('noTypesHint')}</p>
    </div>
  );
}

function FlatList({ keys, selected, onSelect }: { keys: string[]; selected: string | null; onSelect(k: string): void }) {
  return (
    <ul className="mb-3 space-y-0.5">
      {keys.map((n) => (
        <li key={n}><TypeRow k={n} label={n} selected={selected === n} onSelect={() => onSelect(n)} /></li>
      ))}
    </ul>
  );
}

function TreeList({ node, depth, selected, onSelect, collapsed, onToggleFolder, onRenameFolder }: {
  node: FolderNode<{ key: string; name: string }>;
  depth: number;
  selected: string | null;
  onSelect(k: string): void;
  collapsed: Record<string, boolean>;
  onToggleFolder(path: string): void;
  onRenameFolder(path: string, next: string): void;
}) {
  return (
    <ul className="mb-3 space-y-0.5">
      {node.items.map((item) => (
        <li key={item.key} style={{ marginLeft: depth * 12 }}>
          <TypeRow k={item.key} label={item.name} selected={selected === item.key} onSelect={() => onSelect(item.key)} />
        </li>
      ))}
      {node.children.map((child) => (
        <FolderRow
          key={child.path}
          node={child}
          depth={depth}
          isCollapsed={!!collapsed[child.path]}
          onToggle={() => onToggleFolder(child.path)}
          onRename={(next) => onRenameFolder(child.path, next)}
          renderChildren={
            <TreeList
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggleFolder={onToggleFolder}
              onRenameFolder={onRenameFolder}
            />
          }
        />
      ))}
    </ul>
  );
}

function TypeRow({ k, label, selected, onSelect }: { k: string; label: string; selected: boolean; onSelect(): void }) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition ${selected ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200' : 'hover:bg-slate-50 text-slate-700'}`}
      onClick={onSelect}
      data-type-key={k}
    >
      <IconCube className="text-slate-400" />
      <span className="truncate font-mono text-xs">{label}</span>
    </button>
  );
}

function FolderRow({ node, depth, isCollapsed, onToggle, onRename, renderChildren }: {
  node: FolderNode<unknown>;
  depth: number;
  isCollapsed: boolean;
  onToggle(): void;
  onRename(next: string): void;
  renderChildren: ReactNode;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(node.name);
  return (
    <li style={{ marginLeft: depth * 12 }}>
      <div className="group flex items-center gap-1">
        <button
          type="button"
          className="flex flex-1 items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
          onClick={onToggle}
        >
          {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
          {editing ? (
            <input
              autoFocus
              aria-label={t('renameFolder')}
              className="input flex-1 py-0.5 font-mono text-xs"
              value={buffer}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setBuffer(e.target.value)}
              onBlur={() => { setEditing(false); onRename(buildReplacement(node.path, buffer)); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); setEditing(false); onRename(buildReplacement(node.path, buffer)); }
                if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setBuffer(node.name); }
              }}
            />
          ) : (
            <span className="truncate">{node.name}</span>
          )}
          <span className="ml-auto text-[10px] font-normal text-slate-400">{node.totalCount}</span>
        </button>
        <button
          type="button"
          className="btn-icon opacity-0 group-hover:opacity-100"
          aria-label={t('renameFolder')}
          title={t('renameFolder')}
          onClick={(e) => { e.stopPropagation(); setBuffer(node.name); setEditing(true); }}
        >
          ✎
        </button>
      </div>
      {!isCollapsed && renderChildren}
    </li>
  );
}

/** Build the target folder for a rename: swap the last segment of `oldPath` with `newSegment`. */
function buildReplacement(oldPath: string, newSegment: string): string {
  const i = oldPath.lastIndexOf('/');
  return i < 0 ? newSegment : `${oldPath.slice(0, i)}/${newSegment}`;
}
```

- [ ] **Step 4: Verify the folder + legacy tests pass**

Run: `pnpm --filter @zwaggen/web test tests/ui/TypePanel`
Expected: all TypePanel tests green (new folders test + any existing).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @zwaggen/web lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/TypePanel.tsx apps/web/tests/ui/TypePanel.folders.test.tsx
git commit -m "feat(ui): TypePanel renders folder tree + Folder input + rename-folder" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: EndpointList tree rendering with priority fallback

**Files:**
- Modify: `apps/web/src/ui/EndpointList.tsx`
- Create: `apps/web/tests/ui/EndpointList.folders.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/ui/EndpointList.folders.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { EndpointList } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

const ep = (overrides: Partial<Endpoint>): Endpoint => ({
  id: Math.random().toString(36).slice(2),
  method: 'GET', path: '/p', pathParams: [], queryParams: [], headers: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  ...overrides,
});

beforeEach(() => {
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false });
});

test('folder mode: any endpoint with a folder → tree view, tag-groups suppressed', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        ep({ id: 'a', folder: 'auth', path: '/login', tags: ['legacy'] }),
        ep({ id: 'b', path: '/root-only' }),
      ],
    },
  });
  render(<EndpointList />);
  expect(screen.getByRole('button', { name: /auth/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /\/root-only/ })).toBeInTheDocument();
  // legacy tag header from groupByTag must not render in folder mode.
  expect(screen.queryByText(/^legacy$/i)).not.toBeInTheDocument();
});

test('tag mode: no folders, at least one tag → existing tag-group behavior preserved', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        ep({ id: 'a', path: '/a', tags: ['alpha'] }),
        ep({ id: 'b', path: '/b' }),
      ],
    },
  });
  render(<EndpointList />);
  expect(screen.getByText(/alpha/i)).toBeInTheDocument();
  expect(screen.getByText(/untagged/i)).toBeInTheDocument();
});

test('flat mode: no folders, no tags → flat list', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [ep({ id: 'a', path: '/a' }), ep({ id: 'b', path: '/b' })],
    },
  });
  render(<EndpointList />);
  expect(screen.queryByText(/untagged/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /\/a/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/ui/EndpointList.folders.test.tsx`
Expected: FAIL — folder branch is not wired yet.

- [ ] **Step 3: Implement priority-fallback rendering**

Replace the render logic in `apps/web/src/ui/EndpointList.tsx` (the section starting at `const groups = groupByTag(spec.endpoints);` at line 66 through the closing `</aside>` at line 136). Replace with:

```tsx
  const endpointsWithFolder = spec.endpoints.filter((e) => !!e.folder).length > 0;
  const tagGroups = groupByTag(spec.endpoints);
  const flat = tagGroups.length === 1 && tagGroups[0]!.tag === null;

  const folderTree = useMemo(
    () => groupByFolder(spec.endpoints, (e) => e.folder),
    [spec.endpoints],
  );

  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <h2 className="panel-title">{t('endpoints')}</h2>
        <div className="flex items-center gap-1">
          <button className="btn-icon" aria-label={t('newEndpoint')} title={t('newEndpoint')} onClick={() => void add()}><IconPlus /></button>
          <button className="btn-icon" aria-label={t('collapseEndpoints')} title={t('collapse')} onClick={() => setUiPref('endpointsCollapsed', true)}><IconChevronLeft /></button>
        </div>
      </div>
      {spec.endpoints.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"><IconList /></div>
          <p className="text-xs text-slate-500">{t('noEndpointsYet')}</p>
          <p className="text-[11px] text-slate-400">{t('noEndpointsHint')}</p>
        </div>
      ) : endpointsWithFolder ? (
        <EndpointFolderTree tree={folderTree} />
      ) : flat ? (
        <ul className="thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {tagGroups[0]!.endpoints.map((e) => <EndpointListItem key={e.id} endpoint={e} />)}
        </ul>
      ) : (
        <ul className="thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {tagGroups.map((g) => {
            const key = g.tag ?? '__untagged';
            const collapsed = !!collapsedMap[key];
            return (
              <li key={key}>
                <button type="button" className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700" onClick={() => toggleEndpointGroup(key)}>
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
        </ul>
      )}
    </aside>
  );
}

function EndpointFolderTree({ tree }: { tree: FolderNode<Endpoint> }) {
  const { endpointFolderCollapsed } = useUiPrefs();
  return (
    <ul className="thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5">
      <FolderTreeLevel node={tree} depth={0} collapsed={endpointFolderCollapsed} />
    </ul>
  );
}

function FolderTreeLevel({ node, depth, collapsed }: { node: FolderNode<Endpoint>; depth: number; collapsed: Record<string, boolean> }) {
  return (
    <>
      {node.items.map((e) => (
        <li key={e.id} style={{ marginLeft: depth * 12 }}>
          <EndpointListItem endpoint={e} />
        </li>
      ))}
      {node.children.map((child) => {
        const isCollapsed = !!collapsed[child.path];
        return (
          <li key={child.path} style={{ marginLeft: depth * 12 }}>
            <button
              type="button"
              className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
              onClick={() => toggleEndpointFolder(child.path)}
            >
              {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
              <span>{child.name}</span>
              <span className="ml-auto text-[10px] font-normal text-slate-400">{child.totalCount}</span>
            </button>
            {!isCollapsed && (
              <ul className="space-y-0.5">
                <FolderTreeLevel node={child} depth={depth + 1} collapsed={collapsed} />
              </ul>
            )}
          </li>
        );
      })}
    </>
  );
}
```

Also add the new imports near the top of `EndpointList.tsx` (extend the existing imports):

```tsx
import { useMemo } from 'react';
import { groupByFolder, FolderNode } from '../schema/groupByFolder';
import { toggleEndpointFolder } from '../state/uiPrefs';
```

- [ ] **Step 4: Verify all EndpointList tests pass**

Run: `pnpm --filter @zwaggen/web test tests/ui/EndpointList`
Expected: all EndpointList tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/EndpointList.tsx apps/web/tests/ui/EndpointList.folders.test.tsx
git commit -m "feat(ui): EndpointList switches to folder tree when any endpoint has a folder" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: EndpointEditor — Folder input

**Files:**
- Modify: `apps/web/src/ui/EndpointEditor.tsx:217-227`
- Create: `apps/web/tests/ui/EndpointEditor.folder.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/ui/EndpointEditor.folder.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

const seedEndpoint: Endpoint = {
  id: 'e1', method: 'GET', path: '/x', pathParams: [], queryParams: [], headers: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
};

beforeEach(() => {
  useSpecStore.setState({
    spec: { ...emptySpec(), endpoints: [seedEndpoint] },
    selectedEndpointId: 'e1',
    fileHandle: null,
    dirty: false,
  });
});

test('editing the Folder input writes endpoint.folder on blur', async () => {
  const user = userEvent.setup();
  render(<EndpointEditor />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.type(input, '  /auth/admin  ');
  await user.tab();
  const endpoints = useSpecStore.getState().spec.endpoints;
  expect(endpoints[0]!.folder).toBe('auth/admin');
});

test('clearing the Folder input removes the folder field', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [{ ...seedEndpoint, folder: 'auth' }],
    },
    selectedEndpointId: 'e1',
  });
  const user = userEvent.setup();
  render(<EndpointEditor />);
  const input = screen.getByLabelText('Folder') as HTMLInputElement;
  await user.clear(input);
  await user.tab();
  const endpoints = useSpecStore.getState().spec.endpoints;
  expect(endpoints[0]!.folder).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/ui/EndpointEditor.folder.test.tsx`
Expected: FAIL — no Folder input yet.

- [ ] **Step 3: Add the Folder input to the metadata card**

Edit `apps/web/src/ui/EndpointEditor.tsx`. First, extend imports near the top:

```tsx
import { FolderInput } from './FolderInput';
```

Then, inside the metadata `card` section (the `<div className="card p-3">` block spanning lines 187-227), below the `tags` label block, add:

```tsx
          <FolderInput
            className="mt-2"
            value={ep.folder}
            onChange={(next) => {
              const { folder: _, ...rest } = ep;
              const nextEndpoint: Endpoint = next ? { ...rest, folder: next } : (rest as Endpoint);
              setSpec({
                ...spec,
                endpoints: spec.endpoints.map((e) => e.id === ep.id ? nextEndpoint : e),
              });
            }}
          />
```

- [ ] **Step 4: Verify the new tests pass**

Run: `pnpm --filter @zwaggen/web test tests/ui/EndpointEditor`
Expected: folder test green, existing EndpointEditor tests still green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/EndpointEditor.tsx apps/web/tests/ui/EndpointEditor.folder.test.tsx
git commit -m "feat(ui): EndpointEditor exposes Folder input" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: OpenAPI exporter — flatten keys + `x-folder`

**Files:**
- Modify: `apps/web/src/exporters/openapi.ts`
- Create: `apps/web/tests/exporters/openapi.folders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/exporters/openapi.folders.test.ts`:

```ts
import { expect, test } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

test('types in a folder export with flattened key + x-folder', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.types['Order'] = { kind: 'object', fields: [] };
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.auth_User).toBeDefined();
  expect(doc.components.schemas.auth_User['x-folder']).toBe('auth');
  expect(doc.components.schemas.Order).toBeDefined();
  expect(doc.components.schemas.Order['x-folder']).toBeUndefined();
});

test('refs rewrite to the flattened schema key', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['Wrapper'] = { kind: 'object', fields: [
    { name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } },
  ]};
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.Wrapper.properties.user).toEqual({ $ref: '#/components/schemas/auth_User' });
});

test('endpoint folder exports as x-folder on the operation', () => {
  const spec = emptySpec();
  const e: Endpoint = {
    id: 'a', method: 'POST', path: '/login', folder: 'auth/admin',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  };
  spec.endpoints.push(e);
  const doc = toOpenApi(spec);
  expect(doc.paths['/login'].post['x-folder']).toBe('auth/admin');
});

test('multi-segment folder flattens all separators to underscore', () => {
  const spec = emptySpec();
  spec.types['a/b/c/Type'] = { kind: 'object', fields: [] };
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.a_b_c_Type).toBeDefined();
  expect(doc.components.schemas.a_b_c_Type['x-folder']).toBe('a/b/c');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/exporters/openapi.folders.test.ts`
Expected: FAIL — exporter still treats keys as-is.

- [ ] **Step 3: Implement flattening**

Edit `apps/web/src/exporters/openapi.ts`. Replace the full file:

```ts
import type { Spec, TypeDef } from '../schema/types';
import { splitKey } from '../schema/folders';

function flattenKey(key: string): string {
  return key.replace(/\//g, '_');
}

export function toOpenApi(spec: Spec): any {
  const schemas: Record<string, any> = {};
  for (const [key, t] of Object.entries(spec.types)) {
    const flat = flattenKey(key);
    const schema = toSchema(t);
    const { folder } = splitKey(key);
    if (folder) schema['x-folder'] = folder;
    schemas[flat] = schema;
  }

  const paths: Record<string, any> = {};
  for (const e of spec.endpoints) {
    const p = (paths[e.path] ??= {});
    const op: any = {
      summary: e.description,
      parameters: [
        ...e.pathParams.map((x) => param(x, 'path')),
        ...e.queryParams.map((x) => param(x, 'query')),
        ...e.headers.map((x) => param(x, 'header')),
      ],
      ...(e.requestBody ? {
        requestBody: { required: true, content: { 'application/json': { schema: toSchema(e.requestBody) } } },
      } : {}),
      responses: Object.fromEntries(e.responses.map((r) => [
        String(r.status),
        { description: '', content: { 'application/json': { schema: toSchema(r.type) } } },
      ])),
    };
    if (e.tags && e.tags.length) op.tags = [...e.tags];
    if (e.folder) op['x-folder'] = e.folder;
    p[e.method.toLowerCase()] = op;
  }

  const doc: any = {
    openapi: '3.1.0',
    info: { title: spec.info.name, version: spec.info.version ?? '0.1.0', description: spec.info.description },
    paths,
    components: { schemas },
  };
  if (spec.info.baseUrl) doc.servers = [{ url: spec.info.baseUrl }];
  const used = new Set<string>();
  for (const e of spec.endpoints) for (const t of e.tags ?? []) used.add(t);
  if (used.size) doc.tags = [...used].sort().map((name) => ({ name }));
  return doc;
}

function param(p: { name: string; required: boolean; type: TypeDef; description?: string }, where: 'path' | 'query' | 'header') {
  return { name: p.name, in: where, required: p.required, description: p.description, schema: toSchema(p.type) };
}

function toSchema(t: TypeDef): any {
  switch (t.kind) {
    case 'string': {
      const s: any = { type: 'string' };
      if (t.minLength != null) s.minLength = t.minLength;
      if (t.maxLength != null) s.maxLength = t.maxLength;
      if (t.pattern) s.pattern = t.pattern;
      if (t.enum) s.enum = t.enum;
      if (t.description) s.description = t.description;
      return s;
    }
    case 'number':
    case 'integer': {
      const s: any = { type: t.kind };
      if (t.min != null) s.minimum = t.min;
      if (t.max != null) s.maximum = t.max;
      if (t.enum) s.enum = t.enum;
      if (t.description) s.description = t.description;
      return s;
    }
    case 'boolean': return { type: 'boolean', ...(t.description ? { description: t.description } : {}) };
    case 'null': return { type: 'null' };
    case 'literal': return { const: t.value };
    case 'array': {
      const s: any = { type: 'array', items: toSchema(t.element) };
      if (t.minItems != null) s.minItems = t.minItems;
      if (t.maxItems != null) s.maxItems = t.maxItems;
      if (t.example !== undefined) s.example = t.example;
      return s;
    }
    case 'object': {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const f of t.fields) {
        properties[f.name] = toSchema(f.type);
        if (f.required) required.push(f.name);
      }
      const s: any = { type: 'object', properties };
      if (required.length) s.required = required;
      if (t.strict) s.additionalProperties = false;
      if (t.example !== undefined) s.example = t.example;
      return s;
    }
    case 'union': return { oneOf: t.variants.map(toSchema) };
    case 'ref': return { $ref: `#/components/schemas/${flattenKey(t.ref)}` };
  }
}
```

- [ ] **Step 4: Verify exporter tests pass**

Run: `pnpm --filter @zwaggen/web test tests/exporters/openapi`
Expected: new `openapi.folders.test.ts` cases green; any pre-existing openapi exporter tests still green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/exporters/openapi.ts apps/web/tests/exporters/openapi.folders.test.ts
git commit -m "feat(exporter): OpenAPI schema keys flatten to folder_Name with x-folder" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: OpenAPI importer — recover internal keys from `x-folder`

**Files:**
- Modify: `apps/web/src/importers/openapi.ts`
- Create: `apps/web/tests/importers/openapi.folders.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/importers/openapi.folders.test.ts`:

```ts
import { expect, test } from 'vitest';
import { fromOpenApi } from '../../src/importers/openapi';

test('schemas with x-folder restore to folder-qualified internal keys', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: {
      schemas: {
        auth_User: { type: 'object', 'x-folder': 'auth', properties: { id: { type: 'string' } } },
        Order: { type: 'object', properties: {} },
        a_b_c_Deep: { type: 'object', 'x-folder': 'a/b/c', properties: {} },
      },
    },
  };
  const { spec } = fromOpenApi(doc);
  expect(spec.types['auth/User']).toBeDefined();
  expect(spec.types['Order']).toBeDefined();
  expect(spec.types['a/b/c/Deep']).toBeDefined();
});

test('$refs resolve through x-folder of the target schema', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: {
      schemas: {
        auth_User: { type: 'object', 'x-folder': 'auth', properties: {} },
        Wrapper: {
          type: 'object',
          properties: { user: { $ref: '#/components/schemas/auth_User' } },
        },
      },
    },
  };
  const { spec } = fromOpenApi(doc);
  const wrapper = spec.types['Wrapper']! as { kind: 'object'; fields: Array<{ type: { kind: string; ref?: string } }> };
  expect(wrapper.fields[0]!.type).toEqual({ kind: 'ref', ref: 'auth/User' });
});

test('endpoint x-folder populates endpoint.folder', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: { '/login': { post: { 'x-folder': 'auth/admin', responses: {} } } },
  };
  const { spec } = fromOpenApi(doc);
  expect(spec.endpoints[0]!.folder).toBe('auth/admin');
});

test('foreign imports (no x-folder) land flat at root — unchanged behavior', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: { schemas: { User: { type: 'object', properties: {} } } },
  };
  const { spec } = fromOpenApi(doc);
  expect(spec.types['User']).toBeDefined();
  expect(spec.types['auth/User']).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/importers/openapi.folders.test.ts`
Expected: FAIL — importer still uses raw schema keys.

- [ ] **Step 3: Implement recovery**

Edit `apps/web/src/importers/openapi.ts`. Two changes:

(a) Build a map of flat → internal key once during import, then use it when resolving refs and when inserting types.

Replace the block that currently iterates `components.schemas` (lines ~50-57) with:

```ts
  const schemas = (((d.components as Record<string, unknown> | undefined)?.schemas) ?? {}) as Record<string, unknown>;

  // Pass 1: build flat-key → internal-key map from x-folder.
  const keyMap: Record<string, string> = {};
  for (const [flat, raw] of Object.entries(schemas)) {
    let internal = flat;
    if (raw && typeof raw === 'object') {
      const xf = (raw as Record<string, unknown>)['x-folder'];
      if (typeof xf === 'string' && xf.length > 0) internal = `${xf}/${shortNameFor(flat, xf)}`;
    }
    keyMap[flat] = internal;
  }

  // Pass 2: parse schemas, storing under internal keys and rewriting refs.
  for (const [flat, raw] of Object.entries(schemas)) {
    const t = readSchema(raw, warnings, `components.schemas.${flat}`, keyMap);
    if (t) spec.types[keyMap[flat]!] = t;
  }
```

Add a helper at the bottom of the file:

```ts
/** Strip the flattened folder prefix from a schema key to recover the short name. */
function shortNameFor(flat: string, folder: string): string {
  const prefix = `${folder.replace(/\//g, '_')}_`;
  return flat.startsWith(prefix) ? flat.slice(prefix.length) : flat;
}
```

(b) Thread `keyMap` through `readSchema` so the `$ref` branch can look up the target's internal key. Update the signature:

```ts
function readSchema(
  raw: unknown,
  warnings: string[],
  path: string,
  keyMap?: Record<string, string>,
): TypeDef | undefined {
```

And update the `$ref` branch (currently around line 109):

```ts
  if (typeof s.$ref === 'string') {
    const localPrefix = '#/components/schemas/';
    if (s.$ref.startsWith(localPrefix)) {
      const flat = s.$ref.slice(localPrefix.length);
      const internal = keyMap?.[flat] ?? flat;
      return { kind: 'ref', ref: internal };
    }
    warnings.push(`${path}: external or non-components $ref "${s.$ref}" not supported`);
    return undefined;
  }
```

Then propagate `keyMap` on every recursive `readSchema` call within the file (search for `readSchema(` — there are ~8 recursive sites; pass `keyMap` as the fourth arg on each, or rely on a closure by wrapping `readSchema` in the importer body). **Simplest:** add `keyMap` to every call. Example for two of them:

```ts
        readSchema(s.items, warnings, `${path}.items`, keyMap)
```

```ts
        readSchema({ ...s, type: kind, oneOf: undefined, anyOf: undefined, allOf: undefined }, warnings, `${path}.type[${i}]`, keyMap)
```

(Every recursive site inside `readSchema`, `readUnion`, `readAllOf`, and `readOperation`'s parameter/body/response schema calls must forward `keyMap` for ref rewriting to work.)

(c) Add the `x-folder` read on operations. Inside `readOperation`, after the `tags` parsing (around line 352):

```ts
  const xFolder = typeof op['x-folder'] === 'string' && op['x-folder'].length > 0
    ? (op['x-folder'] as string)
    : undefined;
```

And add `...(xFolder ? { folder: xFolder } : {}),` to the returned endpoint object near the end of the function.

- [ ] **Step 4: Verify importer tests pass**

Run: `pnpm --filter @zwaggen/web test tests/importers/openapi`
Expected: new `openapi.folders.test.ts` cases green; any pre-existing importer tests still green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/importers/openapi.ts apps/web/tests/importers/openapi.folders.test.ts
git commit -m "feat(importer): read x-folder to recover internal type keys + endpoint.folder" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: JSON Schema exporter — flatten `$defs` keys

**Files:**
- Modify: `apps/web/src/exporters/jsonschema.ts`
- Create: `apps/web/tests/exporters/jsonschema.folders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/exporters/jsonschema.folders.test.ts`:

```ts
import { expect, test } from 'vitest';
import { toJsonSchemaBundle } from '../../src/exporters/jsonschema';
import { emptySpec } from '../../src/schema/defaults';

test('$defs keys flatten with underscore, refs rewrite accordingly', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['Wrapper'] = { kind: 'object', fields: [
    { name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } },
  ]};
  const bundle = toJsonSchemaBundle(spec);
  expect(bundle.$defs.auth_User).toBeDefined();
  expect(bundle.$defs.Wrapper.properties.user).toEqual({ $ref: '#/$defs/auth_User' });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/web test tests/exporters/jsonschema`
Expected: FAIL — current exporter uses raw keys.

- [ ] **Step 3: Implement flattening**

Edit `apps/web/src/exporters/jsonschema.ts`. Replace the full file:

```ts
import type { Spec, TypeDef } from '../schema/types';

function flattenKey(key: string): string {
  return key.replace(/\//g, '_');
}

export function toJsonSchemaBundle(spec: Spec): any {
  const $defs: Record<string, any> = {};
  for (const [key, t] of Object.entries(spec.types)) $defs[flattenKey(key)] = toSchema(t);
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', $defs };
}

function toSchema(t: TypeDef): any {
  switch (t.kind) {
    case 'string': {
      const s: any = { type: 'string' };
      if (t.minLength != null) s.minLength = t.minLength;
      if (t.maxLength != null) s.maxLength = t.maxLength;
      if (t.pattern) s.pattern = t.pattern;
      if (t.enum) s.enum = t.enum;
      return s;
    }
    case 'number':
    case 'integer': {
      const s: any = { type: t.kind };
      if (t.min != null) s.minimum = t.min;
      if (t.max != null) s.maximum = t.max;
      if (t.enum) s.enum = t.enum;
      return s;
    }
    case 'boolean': return { type: 'boolean' };
    case 'null': return { type: 'null' };
    case 'literal': return { const: t.value };
    case 'array': {
      const s: any = { type: 'array', items: toSchema(t.element) };
      if (t.minItems != null) s.minItems = t.minItems;
      if (t.maxItems != null) s.maxItems = t.maxItems;
      return s;
    }
    case 'object': {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const f of t.fields) {
        properties[f.name] = toSchema(f.type);
        if (f.required) required.push(f.name);
      }
      const s: any = { type: 'object', properties };
      if (required.length) s.required = required;
      if (t.strict) s.additionalProperties = false;
      return s;
    }
    case 'union': return { oneOf: t.variants.map(toSchema) };
    case 'ref': return { $ref: `#/$defs/${flattenKey(t.ref)}` };
  }
}
```

- [ ] **Step 4: Verify the test passes**

Run: `pnpm --filter @zwaggen/web test tests/exporters/jsonschema`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/exporters/jsonschema.ts apps/web/tests/exporters/jsonschema.folders.test.ts
git commit -m "feat(exporter): JSON Schema $defs flatten folder paths with underscore" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Markdown exporter — folder headings

**Files:**
- Modify: `apps/web/src/exporters/markdown.ts`

The current exporter (`apps/web/src/exporters/markdown.ts`, 118 lines) iterates `spec.types` flat and groups endpoints by `primaryTag = e.tags?.[0]`. The folder-mode change: when any type key contains `/`, group the Types section by folder; when any endpoint has a `folder`, group the Endpoints section by folder instead of tags. Preserve today's tag-group fallback unchanged.

- [ ] **Step 1: Implement folder-aware grouping**

Replace the body of `apps/web/src/exporters/markdown.ts`:

```ts
import type { Spec, Endpoint, TypeDef, ParamDef } from '../schema/types';
import { splitKey } from '../schema/folders';
import { groupByFolder, FolderNode } from '../schema/groupByFolder';

export function toMarkdown(spec: Spec): string {
  const out: string[] = [];
  out.push(`# ${spec.info.name}`);
  if (spec.info.description) out.push(spec.info.description);
  if (spec.info.baseUrl) out.push(`**Base URL:** \`${spec.info.baseUrl}\`\n`);

  // --- Types ---------------------------------------------------------------
  const typeKeys = Object.keys(spec.types);
  if (typeKeys.length) {
    out.push('\n## Types\n');
    const anyInFolder = typeKeys.some((k) => k.includes('/'));
    if (!anyInFolder) {
      for (const name of typeKeys) emitType(out, name, spec.types[name]!);
    } else {
      const typeItems = typeKeys.map((key) => { const s = splitKey(key); return { key, folder: s.folder, name: s.name }; });
      const tree = groupByFolder(typeItems, (i) => i.folder);
      emitTypeTree(out, spec, tree);
    }
  }

  // --- Endpoints -----------------------------------------------------------
  const endpointsHaveFolder = spec.endpoints.some((e) => !!e.folder);
  if (endpointsHaveFolder) {
    const tree = groupByFolder(spec.endpoints, (e) => e.folder);
    emitEndpointTree(out, tree);
  } else {
    // Existing tag-group behavior: first tag becomes the group key; null groups are "Untagged".
    const groups = new Map<string | null, Endpoint[]>();
    for (const e of spec.endpoints) {
      const key = e.tags?.[0] ?? null;
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    const ordered: (string | null)[] = [
      ...[...groups.keys()].filter((k): k is string => k !== null).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      ...(groups.has(null) ? [null] : []),
    ];
    const flat = ordered.length === 1 && ordered[0] === null;
    if (flat) {
      for (const e of groups.get(null)!) emitEndpoint(out, e, 2);
    } else {
      for (const key of ordered) {
        out.push(`\n## ${key ?? 'Untagged'}\n`);
        for (const e of groups.get(key)!) emitEndpoint(out, e, 3);
      }
    }
  }

  return out.join('\n');
}

function emitType(out: string[], name: string, t: TypeDef): void {
  out.push(`### ${name}\n`);
  out.push('```json');
  out.push(describe(t));
  out.push('```\n');
  const ex = (t.kind === 'object' || t.kind === 'array') ? t.example : undefined;
  if (ex !== undefined) {
    out.push('#### Example\n');
    out.push('```json');
    out.push(JSON.stringify(ex, null, 2));
    out.push('```\n');
  }
}

function emitTypeTree(
  out: string[],
  spec: Spec,
  node: FolderNode<{ key: string; name: string; folder: string | undefined }>,
): void {
  // Root items first (no "Folder:" heading for the virtual root).
  for (const item of node.items) emitType(out, item.name, spec.types[item.key]!);
  for (const child of node.children) {
    out.push(`\n### Folder: ${child.path}\n`);
    for (const item of child.items) emitType(out, item.name, spec.types[item.key]!);
    for (const grand of child.children) emitTypeTree(out, spec, { name: '', path: '', items: [], children: [grand], totalCount: grand.totalCount });
  }
}

function emitEndpointTree(out: string[], node: FolderNode<Endpoint>): void {
  for (const e of node.items) emitEndpoint(out, e, 2);
  for (const child of node.children) {
    out.push(`\n## ${child.path}\n`);
    for (const e of child.items) emitEndpoint(out, e, 3);
    // Deeper subfolders: recurse using the child as a new root so indices stay under ## (the top level was already emitted).
    for (const grand of child.children) {
      out.push(`\n### ${grand.path}\n`);
      for (const e of grand.items) emitEndpoint(out, e, 4);
      // At depth 3+, flatten further recursion into inline H4 headings to avoid an exploding heading cascade.
      const walk = (n: FolderNode<Endpoint>, depth: number): void => {
        for (const c of n.children) {
          out.push(`\n${'#'.repeat(depth)} ${c.path}\n`);
          for (const ep of c.items) emitEndpoint(out, ep, depth + 1);
          walk(c, depth + 1);
        }
      };
      walk(grand, 4);
    }
  }
}

function emitEndpoint(out: string[], e: Endpoint, depth: number): void {
  const h = (n: number) => '#'.repeat(n);
  out.push(`\n${h(depth)} ${e.method} ${e.path}\n`);
  if (e.description) out.push(`${e.description}\n`);
  if (e.pathParams.length) out.push(paramTable('Path params', e.pathParams, depth + 1));
  if (e.queryParams.length) out.push(paramTable('Query params', e.queryParams, depth + 1));
  if (e.headers.length) out.push(paramTable('Headers', e.headers, depth + 1));
  if (e.requestBody) {
    out.push(`${h(depth + 1)} Request body\n\`\`\`json`);
    out.push(describe(e.requestBody));
    out.push('```');
  }
  out.push(`${h(depth + 1)} Responses\n`);
  for (const r of e.responses) {
    out.push(`${h(depth + 2)} ${r.status}\n`);
    out.push('```json');
    out.push(describe(r.type));
    out.push('```\n');
  }
}

function paramTable(title: string, params: ParamDef[], headingDepth: number): string {
  const h = '#'.repeat(headingDepth);
  const lines = [`${h} ${title}\n`, '| name | type | required | description |', '| --- | --- | --- | --- |'];
  for (const p of params) {
    lines.push(`| ${p.name} | ${typeLabel(p.type)} | ${p.required ? 'yes' : 'no'} | ${p.description ?? ''} |`);
  }
  return lines.join('\n') + '\n';
}

function typeLabel(t: TypeDef): string {
  switch (t.kind) {
    case 'array': return `${typeLabel(t.element)}[]`;
    case 'ref': return t.ref;
    case 'literal': return `literal(${JSON.stringify(t.value)})`;
    case 'union': return t.variants.map(typeLabel).join(' | ');
    default: return t.kind;
  }
}

function describe(t: TypeDef): string { return JSON.stringify(skeleton(t), null, 2); }

function skeleton(t: TypeDef): unknown {
  switch (t.kind) {
    case 'string': return 'string';
    case 'number':
    case 'integer': return 0;
    case 'boolean': return false;
    case 'null': return null;
    case 'literal': return t.value;
    case 'array': return [skeleton(t.element)];
    case 'object': return Object.fromEntries(t.fields.map((f) => [f.required ? f.name : `${f.name}?`, skeleton(f.type)]));
    case 'union': return t.variants.map(skeleton);
    case 'ref': return `#${t.ref}`;
  }
}
```

- [ ] **Step 2: Run the exporter tests**

Run: `pnpm --filter @zwaggen/web test tests/exporters`
Expected: all green (the bundle test asserts file presence, not content; existing markdown rendering for folder-free specs is bit-identical to pre-change behavior).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/exporters/markdown.ts
git commit -m "feat(exporter): markdown emits Folder: <path> headings per folder" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Round-trip fixture + E2E flow

**Files:**
- Modify: `apps/web/tests/exporters/bundle.test.ts`
- Create: `apps/web/e2e/folders.spec.ts`

- [ ] **Step 1: Add the round-trip fixture test**

Append to `apps/web/tests/exporters/bundle.test.ts`:

```ts
import { fromOpenApi } from '../../src/importers/openapi';
import { toOpenApi } from '../../src/exporters/openapi';

test('types + endpoints with folders round-trip through OpenAPI', () => {
  const original = emptySpec('Round');
  original.types['auth/User'] = { kind: 'object', fields: [
    { name: 'id', required: true, type: { kind: 'string' } },
  ]};
  original.types['auth/admin/Session'] = { kind: 'object', fields: [
    { name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } },
  ]};
  original.types['Order'] = { kind: 'object', fields: [] };
  original.endpoints.push({
    id: 'a', method: 'GET', path: '/me', folder: 'auth',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'auth/User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });

  const doc = toOpenApi(original);
  const { spec: reimported, warnings } = fromOpenApi(doc);
  expect(warnings).toEqual([]);

  expect(reimported.types['auth/User']).toBeDefined();
  expect(reimported.types['auth/admin/Session']).toBeDefined();
  expect(reimported.types['Order']).toBeDefined();

  // structural equality on types (order of keys is irrelevant for deep-equal)
  expect(reimported.types['auth/admin/Session']).toEqual(original.types['auth/admin/Session']);

  const ep = reimported.endpoints[0]!;
  expect(ep.folder).toBe('auth');
  expect(ep.responses[0]!.type).toEqual({ kind: 'ref', ref: 'auth/User' });
});
```

- [ ] **Step 2: Run the bundle test**

Run: `pnpm --filter @zwaggen/web test tests/exporters/bundle.test.ts`
Expected: all green.

- [ ] **Step 3: Write the Playwright flow**

Create `apps/web/e2e/folders.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('folders', () => {
  test('typing a Folder on an endpoint materializes the tree and persists across reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Create a new endpoint via the plus button in EndpointList
    await page.getByRole('button', { name: /New endpoint/i }).click();
    await page.getByRole('button', { name: /^GET \//i }).click();

    // In the editor, fill the Folder input and blur
    const folder = page.getByLabel('Folder');
    await folder.fill('auth/admin');
    await folder.press('Tab');

    // Sidebar should now render the folder tree
    await expect(page.getByRole('button', { name: /^auth/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^admin/i }).first()).toBeVisible();

    // Reload; the draft store + uiPrefs should reopen with the tree intact
    await page.reload();
    await expect(page.getByRole('button', { name: /^auth/i }).first()).toBeVisible();
  });

  test('renaming a type folder moves every descendant and updates refs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Open the types panel
    await page.getByRole('button', { name: /Expand Types|展開 型別/ }).click();
    // Add a type
    await page.getByRole('button', { name: /Add type/i }).click();
    // Type name defaults to NewType; move it into a folder via the Folder input
    const folder = page.getByLabel('Folder').first();
    await folder.fill('auth');
    await folder.press('Tab');

    // Rename the folder via the pencil button
    await page.getByRole('button', { name: /Rename folder/i }).first().click();
    const renameInput = page.getByRole('textbox', { name: /Rename folder/i });
    await renameInput.fill('identity');
    await renameInput.press('Enter');

    // The old folder name should be gone, the new one present
    await expect(page.getByRole('button', { name: /^auth$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^identity$/i })).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the e2e**

Run: `pnpm --filter @zwaggen/web e2e folders.spec.ts`
Expected: both tests green. If any assertion trips on copy differences (e.g., "New endpoint" translation mismatch), update the selector to match the current `en.json` value.

- [ ] **Step 5: Ship the TODO tick + spec/plan move**

Do not move the spec and plan yet — that happens in the final "ship" commit after the user reviews the merged feature on main. Leave them in `active/`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/exporters/bundle.test.ts apps/web/e2e/folders.spec.ts
git commit -m "test: round-trip + e2e coverage for folders feature" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Ship checklist (run after all 15 tasks above)

These are housekeeping steps, not TDD tasks. Do them once the branch is green on main.

1. Refresh screenshots if any sidebar capture changed visibly:
   ```bash
   SCREENSHOTS=1 pnpm --filter @zwaggen/web e2e:screenshots
   ```
2. Move spec and plan to `done/`:
   ```bash
   git mv docs/specs/active/2026-04-20-folders-types-endpoints.md docs/specs/done/
   git mv docs/plans/active/2026-04-20-folders-types-endpoints.md docs/plans/done/
   ```
3. Tick the TODO item — add a new line under `## Feature` in `docs/TODO.md`:
   ```markdown
   - [x] Folders for Types and Endpoints — see `docs/plans/done/2026-04-20-folders-types-endpoints.md`.
   ```
4. File a follow-up TODO under "Follow-up from shipped work":
   - Drag-and-drop between folders in `TypePanel` and `EndpointList`.
5. Commit the ship bundle and push.

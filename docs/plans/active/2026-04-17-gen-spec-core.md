# gen-spec — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based typed API spec builder + runtime tester that combines Postman-style testing, Swagger-style documentation, and Zod-style runtime validation, backed by a portable canonical JSON file.

**Spec:** `docs/specs/active/2026-04-17-gen-spec-core.md`

**Architecture:** Client-side React SPA (Vite + TypeScript). State in Zustand store holding a single canonical `Spec` document. The spec persists to disk via the File System Access API (with a download/upload fallback) and to IndexedDB as an always-on draft cache. A separate `packages/proxy` npm package publishes a `gen-spec-proxy` CLI that routes requests through a local HTTP proxy when users need to set cookies or other browser-forbidden headers. Exports (OpenAPI 3.1, JSON Schema `$defs` bundle, Markdown docs) are pure functions from the spec and are always bundled with the canonical JSON in a zip.

**Tech Stack:**
- React 18 + TypeScript + Vite (SPA)
- Tailwind CSS + Radix UI primitives (dropdowns, dialogs, tooltips)
- Zustand (state store)
- `idb-keyval` (IndexedDB wrapper for draft cache + secrets)
- `yaml` (OpenAPI YAML export)
- `jszip` (bundled export zips)
- Vitest + React Testing Library (unit/component tests)
- Playwright (E2E smoke test)
- `pnpm` workspaces for the monorepo (web app + proxy CLI)
- Node 20+ built-in `http` + `fetch` for the proxy CLI
- `tsx` to run the proxy in dev; `tsup` to bundle it for publish

---

## Rules Applied
The `docs/rules/` directory is empty at plan time. Two rules will be introduced as part of this plan because they protect invariants that span many tasks:

- `docs/rules/spec-versioning.md` — introduced in Task 2. All readers must check `schemaVersion` before trusting the rest of the file; writers bump `schemaVersion` when the canonical shape changes. Prevents silent data loss (spec edge case "Spec file from a newer schema version").
- `docs/rules/validator-cycles.md` — introduced in Task 8. The runtime validator must handle circular named-type references without stack overflow. All paths through the type system that recurse must use an iterative visitor or explicit cycle detection (spec edge case "Circular type references").

---

## Architecture

The app is a single-page React application. State lives in one Zustand store whose only meaningful field is the current `Spec` document plus some runtime/UI slices (currently opened file handle, last response, error state). Everything the user edits mutates this store. All I/O — saving to disk, loading from disk, exporting, sending requests, validating responses — is a pure function of the store state.

```
┌────────────────────────────────────────────────────────┐
│  UI (React components; Tailwind + Radix)               │
│  ┌────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Type panel │  │ Endpoints   │  │ Env / Auth      │  │
│  └────────────┘  └─────────────┘  └─────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Endpoint editor + Send button + Response viewer  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬───────────────────────────────┘
                         │  reads/writes
                ┌────────▼─────────┐
                │  Zustand store   │     ← single Spec doc
                └────────┬─────────┘
                         │
       ┌─────────────────┼────────────────────┐
       │                 │                    │
   ┌───▼────┐     ┌──────▼──────┐     ┌───────▼──────┐
   │Storage │     │ Runner +    │     │  Exporters   │
   │(file + │     │ Validator   │     │ (OAS/JS/MD)  │
   │ IDB)   │     └──────┬──────┘     └──────────────┘
   └────────┘            │
                         │ optional
                 ┌───────▼────────┐
                 │ Local proxy    │  (separate package)
                 │ gen-spec-proxy │
                 └────────────────┘
```

Every module is pure where possible. The validator, substitution, and exporters are pure functions. Only storage and the runner have side effects.

---

## File Structure

Monorepo root: `/Users/victor/project/gen-spec`

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `package.json` | Root workspace metadata |
| Create | `pnpm-workspace.yaml` | Declares `apps/*` and `packages/*` workspaces |
| Create | `tsconfig.base.json` | Shared TS config |
| Create | `.gitignore` | Ignore `node_modules`, `dist`, etc. |
| Create | `apps/web/package.json` | Web app deps |
| Create | `apps/web/vite.config.ts` | Vite config with Vitest |
| Create | `apps/web/tailwind.config.ts`, `postcss.config.js` | Tailwind |
| Create | `apps/web/index.html` | SPA entrypoint |
| Create | `apps/web/src/main.tsx` | React mount |
| Create | `apps/web/src/App.tsx` | Top-level shell |
| Create | `apps/web/src/schema/types.ts` | Canonical `Spec` / `TypeDef` / `Endpoint` types |
| Create | `apps/web/src/schema/serialize.ts` | `toJSON` / `fromJSON` with schemaVersion check |
| Create | `apps/web/src/schema/defaults.ts` | Empty-spec factory |
| Create | `apps/web/src/schema/rename.ts` | Rename named type + update refs |
| Create | `apps/web/src/validator/validate.ts` | Value-vs-TypeDef validator (cycle-safe) |
| Create | `apps/web/src/storage/drafts.ts` | IndexedDB draft/secret cache |
| Create | `apps/web/src/storage/file.ts` | File System Access wrapper + fallback |
| Create | `apps/web/src/state/store.ts` | Zustand store |
| Create | `apps/web/src/runner/substitute.ts` | `{{var}}` substitution |
| Create | `apps/web/src/runner/auth.ts` | Apply auth preset to request |
| Create | `apps/web/src/runner/send.ts` | Execute request (direct or proxy) |
| Create | `apps/web/src/runner/classify-error.ts` | Network / CORS / timeout classification |
| Create | `apps/web/src/exporters/openapi.ts` | Spec → OpenAPI 3.1 |
| Create | `apps/web/src/exporters/jsonschema.ts` | Spec → JSON Schema `$defs` |
| Create | `apps/web/src/exporters/markdown.ts` | Spec → Markdown docs |
| Create | `apps/web/src/exporters/bundle.ts` | Zip bundle (canonical JSON + chosen export) |
| Create | `apps/web/src/ui/TypePanel.tsx` | Named-types CRUD |
| Create | `apps/web/src/ui/TypeBuilder.tsx` | Recursive type builder |
| Create | `apps/web/src/ui/EndpointList.tsx` | Endpoints sidebar |
| Create | `apps/web/src/ui/EndpointEditor.tsx` | Edit method/path/params/body/responses |
| Create | `apps/web/src/ui/ParamTable.tsx` | Path/query/header param editor |
| Create | `apps/web/src/ui/EnvEditor.tsx` | Environments + active-env switcher |
| Create | `apps/web/src/ui/AuthEditor.tsx` | Auth preset editor |
| Create | `apps/web/src/ui/RunPanel.tsx` | Send button, response viewer |
| Create | `apps/web/src/ui/ResponseView.tsx` | JSON with squiggly-underline errors |
| Create | `apps/web/src/ui/AppHeader.tsx` | New / Open / Save / Export controls |
| Create | `apps/web/tests/**/*.test.ts` | Vitest unit tests |
| Create | `apps/web/e2e/smoke.spec.ts` | Playwright smoke test |
| Create | `packages/proxy/package.json` | Proxy CLI deps + `bin` entry |
| Create | `packages/proxy/src/server.ts` | HTTP proxy implementation |
| Create | `packages/proxy/src/cli.ts` | CLI entrypoint |
| Create | `packages/proxy/tests/server.test.ts` | Proxy integration tests |
| Create | `docs/rules/index.md` | Rules index |
| Create | `docs/rules/spec-versioning.md` | Versioning rule |
| Create | `docs/rules/validator-cycles.md` | Cycle-safety rule |

---

## Tasks

### Task 1: Monorepo skeleton + Vite web app

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/postcss.config.js`, `apps/web/tailwind.config.ts`, `apps/web/src/index.css`
- Test: `apps/web/tests/smoke.test.tsx`

**Acceptance criteria:** foundation for all other criteria; no criteria directly verified.

- [x] **Step 1: Create workspace root files**

`package.json`:
```json
{
  "name": "gen-spec",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "pnpm --filter web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

`.gitignore`:
```
node_modules
dist
coverage
.playwright
*.local
.DS_Store
```

- [x] **Step 2: Create web app package**

`apps/web/package.json`:
```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.1",
    "@radix-ui/react-dropdown-menu": "^2.1.1",
    "@radix-ui/react-tooltip": "^1.1.1",
    "idb-keyval": "^6.2.1",
    "jszip": "^3.10.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "yaml": "^2.5.0",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vitest": "^2.0.3"
  }
}
```

`apps/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests", "vite.config.ts"],
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  }
}
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>gen-spec</title>
  </head>
  <body class="bg-slate-50 text-slate-900">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`apps/web/src/App.tsx`:
```tsx
export function App() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">gen-spec</h1>
    </div>
  );
}
```

`apps/web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`apps/web/postcss.config.js`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [x] **Step 3: Smoke test**

`apps/web/tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`apps/web/tests/smoke.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

test('renders title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'gen-spec' })).toBeInTheDocument();
});
```

- [x] **Step 4: Install and verify**

Run: `pnpm install`
Run: `pnpm --filter web test`
Expected: 1 test passes.
Run: `pnpm --filter web build`
Expected: build succeeds, `apps/web/dist/` produced.

- [x] **Step 5: Commit**

```bash
git add .gitignore package.json pnpm-workspace.yaml tsconfig.base.json apps/web
git commit -m "chore: scaffold monorepo and Vite web app"
```

---

### Task 2: Canonical Spec schema + versioning rule

**Files:**
- Create: `apps/web/src/schema/types.ts`, `apps/web/src/schema/defaults.ts`, `apps/web/src/schema/serialize.ts`
- Create: `docs/rules/index.md`, `docs/rules/spec-versioning.md`
- Test: `apps/web/tests/schema/serialize.test.ts`

**Acceptance criteria:** storage #4 ("plain JSON with stable shape"), storage edge case "Spec file from newer schema version"; foundation for all type/endpoint criteria.

- [x] **Step 1: Write the versioning rule**

`docs/rules/index.md`:
```markdown
# Rules Index
- [spec-versioning](./spec-versioning.md) — reading/writing the canonical spec file
- [validator-cycles](./validator-cycles.md) — cycle handling in the runtime validator
```

`docs/rules/spec-versioning.md`:
```markdown
# Spec File Versioning

The canonical JSON spec file MUST carry a top-level `schemaVersion: number` integer.

- **Current version:** `1`.
- **Readers** must check `schemaVersion` first. If it is higher than the reader's supported version, the reader MUST refuse to load and surface a "newer version" error. Readers never attempt to silently ignore unknown fields from a newer version.
- **Writers** must emit the current version. When the canonical shape changes in a way that older readers cannot handle, bump the number.
- **Why:** prevents silent data loss when specs travel between versions of the app.
```

- [x] **Step 2: Write the spec types**

`apps/web/src/schema/types.ts`:
```ts
export const CURRENT_SCHEMA_VERSION = 1 as const;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type TypeDef =
  | StringType | NumberType | IntegerType | BooleanType | NullType
  | LiteralType | ArrayType | ObjectType | UnionType | RefType;

export interface StringType {
  kind: 'string';
  description?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
}
export interface NumberType {
  kind: 'number';
  description?: string;
  min?: number;
  max?: number;
  enum?: number[];
}
export interface IntegerType {
  kind: 'integer';
  description?: string;
  min?: number;
  max?: number;
  enum?: number[];
}
export interface BooleanType { kind: 'boolean'; description?: string }
export interface NullType { kind: 'null'; description?: string }
export interface LiteralType {
  kind: 'literal';
  value: string | number | boolean | null;
  description?: string;
}
export interface ArrayType {
  kind: 'array';
  element: TypeDef;
  description?: string;
  minItems?: number;
  maxItems?: number;
}
export interface ObjectField {
  name: string;
  required: boolean;
  type: TypeDef;
  description?: string;
}
export interface ObjectType {
  kind: 'object';
  description?: string;
  strict?: boolean;
  fields: ObjectField[];
}
export interface UnionType { kind: 'union'; description?: string; variants: TypeDef[] }
export interface RefType { kind: 'ref'; ref: string; description?: string }

export interface ParamDef {
  name: string;
  required: boolean;
  type: TypeDef;
  description?: string;
}

export type AuthPreset =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apiKey'; in: 'header' | 'query'; name: string; value: string };

export interface ResponseDef { status: number; type: TypeDef }

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
}

export interface EnvVariable {
  name: string;
  value: string;
  secret: boolean;
}
export interface Environment { variables: EnvVariable[] }

export interface Spec {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  info: { name: string; version?: string; description?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: Endpoint[];
}
```

- [x] **Step 3: Defaults factory**

`apps/web/src/schema/defaults.ts`:
```ts
import { CURRENT_SCHEMA_VERSION, Spec } from './types';

export function emptySpec(name = 'Untitled API'): Spec {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    info: { name },
    types: {},
    environments: { default: { variables: [] } },
    activeEnvironment: 'default',
    auth: { type: 'none' },
    useProxyDefault: false,
    endpoints: [],
  };
}
```

- [x] **Step 4: Serialize / deserialize with version gate (write failing tests first)**

`apps/web/tests/schema/serialize.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { emptySpec } from '../../src/schema/defaults';
import { fromJSON, toJSON, SpecVersionError } from '../../src/schema/serialize';

describe('spec serialization', () => {
  test('round-trips an empty spec', () => {
    const s = emptySpec();
    const j = toJSON(s);
    const back = fromJSON(JSON.parse(j));
    expect(back).toEqual(s);
  });

  test('rejects missing schemaVersion', () => {
    expect(() => fromJSON({ info: { name: 'x' } })).toThrow(SpecVersionError);
  });

  test('rejects a higher schemaVersion', () => {
    expect(() => fromJSON({ schemaVersion: 999, info: { name: 'x' } })).toThrow(SpecVersionError);
  });

  test('sorts object keys stably', () => {
    const s = emptySpec('B');
    const j = toJSON(s);
    // key order deterministic: schemaVersion first
    expect(j.indexOf('"schemaVersion"')).toBeLessThan(j.indexOf('"info"'));
  });
});
```

Run: `pnpm --filter web test tests/schema/serialize.test.ts`
Expected: FAIL (`serialize` not found).

- [x] **Step 5: Implement serialize**

`apps/web/src/schema/serialize.ts`:
```ts
import { CURRENT_SCHEMA_VERSION, Spec } from './types';

export class SpecVersionError extends Error {
  constructor(public readonly found: unknown) {
    super(
      found === undefined
        ? 'Spec file is missing schemaVersion'
        : `Spec file uses schemaVersion ${String(found)} which this app does not support (expected ${CURRENT_SCHEMA_VERSION})`,
    );
  }
}

const KEY_ORDER: Array<keyof Spec> = [
  'schemaVersion',
  'info',
  'types',
  'environments',
  'activeEnvironment',
  'auth',
  'useProxyDefault',
  'endpoints',
];

export function toJSON(spec: Spec): string {
  const ordered: Record<string, unknown> = {};
  for (const k of KEY_ORDER) ordered[k] = spec[k];
  return JSON.stringify(ordered, null, 2);
}

export function fromJSON(raw: unknown): Spec {
  if (typeof raw !== 'object' || raw === null) throw new SpecVersionError(undefined);
  const obj = raw as Record<string, unknown>;
  const v = obj.schemaVersion;
  if (v !== CURRENT_SCHEMA_VERSION) throw new SpecVersionError(v);
  // Trust the shape (app only reads its own output). Full structural
  // validation is not MVP — version gate is the load guard per
  // docs/rules/spec-versioning.md.
  return obj as unknown as Spec;
}
```

Run: `pnpm --filter web test tests/schema/serialize.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add docs/rules apps/web/src/schema apps/web/tests/schema
git commit -m "feat(schema): add canonical Spec types and versioned (de)serialization"
```

---

### Task 3: IndexedDB draft + secret cache

**Files:**
- Create: `apps/web/src/storage/drafts.ts`
- Test: `apps/web/tests/storage/drafts.test.ts`

**Acceptance criteria:** storage #3 ("Unsaved edits persist across reload"), storage #4 ("discard draft"), auth #5 ("Secrets never written into the spec"), env edge case "Opening a spec where secrets were stripped".

- [x] **Step 1: Write failing tests**

`apps/web/tests/storage/drafts.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { clearDraft, loadDraft, loadSecrets, saveDraft, saveSecrets } from '../../src/storage/drafts';
import { emptySpec } from '../../src/schema/defaults';

beforeEach(async () => { await clearDraft(); });

test('round-trips a draft spec', async () => {
  const s = emptySpec('Hello');
  await saveDraft(s);
  expect(await loadDraft()).toEqual(s);
});

test('clearDraft removes the draft', async () => {
  await saveDraft(emptySpec());
  await clearDraft();
  expect(await loadDraft()).toBeNull();
});

test('secrets are stored separately from the spec', async () => {
  await saveSecrets({ default: { TOKEN: 'abc' } });
  expect(await loadSecrets()).toEqual({ default: { TOKEN: 'abc' } });
});
```

Add dev dep in `apps/web/package.json`: `"fake-indexeddb": "^6.0.0"` and `pnpm install`.

Run: `pnpm --filter web test tests/storage/drafts.test.ts`
Expected: FAIL.

- [x] **Step 2: Implement**

`apps/web/src/storage/drafts.ts`:
```ts
import { del, get, set } from 'idb-keyval';
import type { Spec } from '../schema/types';

const DRAFT_KEY = 'gen-spec:draft';
const SECRETS_KEY = 'gen-spec:secrets';

export type SecretStore = Record<string /* envName */, Record<string /* varName */, string>>;

export async function saveDraft(spec: Spec): Promise<void> {
  await set(DRAFT_KEY, spec);
}
export async function loadDraft(): Promise<Spec | null> {
  const s = await get<Spec>(DRAFT_KEY);
  return s ?? null;
}
export async function clearDraft(): Promise<void> {
  await del(DRAFT_KEY);
}
export async function saveSecrets(secrets: SecretStore): Promise<void> {
  await set(SECRETS_KEY, secrets);
}
export async function loadSecrets(): Promise<SecretStore> {
  return (await get<SecretStore>(SECRETS_KEY)) ?? {};
}
```

Run tests: PASS.

- [x] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/src/storage apps/web/tests/storage
git commit -m "feat(storage): IndexedDB draft and secret cache"
```

---

### Task 4: File System Access + download/upload fallback

**Files:**
- Create: `apps/web/src/storage/file.ts`
- Test: `apps/web/tests/storage/file.test.ts`

**Acceptance criteria:** storage #1 ("open from disk"), storage #2 ("save back"), storage #5 ("plain JSON that diffs cleanly"), edge case "Browser without File System Access API".

- [x] **Step 1: Write failing tests**

`apps/web/tests/storage/file.test.ts`:
```ts
import { expect, test, vi } from 'vitest';
import { supportsFileSystemAccess, writeFile, readFile } from '../../src/storage/file';

test('detects File System Access API absence', () => {
  const original = (globalThis as any).showOpenFilePicker;
  delete (globalThis as any).showOpenFilePicker;
  expect(supportsFileSystemAccess()).toBe(false);
  if (original) (globalThis as any).showOpenFilePicker = original;
});

test('writeFile uses handle when provided', async () => {
  const write = vi.fn();
  const close = vi.fn();
  const handle = { createWritable: vi.fn(async () => ({ write, close })) } as any;
  await writeFile('{"a":1}', handle);
  expect(write).toHaveBeenCalledWith('{"a":1}');
  expect(close).toHaveBeenCalled();
});

test('readFile returns handle text', async () => {
  const file = new File(['{"k":1}'], 'spec.json', { type: 'application/json' });
  const handle = { getFile: async () => file } as any;
  const { text, name } = await readFile(handle);
  expect(JSON.parse(text)).toEqual({ k: 1 });
  expect(name).toBe('spec.json');
});
```

- [x] **Step 2: Implement**

`apps/web/src/storage/file.ts`:
```ts
export type FileHandle = FileSystemFileHandle;

export function supportsFileSystemAccess(): boolean {
  return typeof (globalThis as any).showOpenFilePicker === 'function';
}

export async function pickOpen(): Promise<FileHandle | null> {
  const [handle] = await (globalThis as any).showOpenFilePicker({
    types: [{ description: 'gen-spec JSON', accept: { 'application/json': ['.json', '.gen-spec.json'] } }],
    multiple: false,
  });
  return handle ?? null;
}

export async function pickSave(suggestedName = 'spec.gen-spec.json'): Promise<FileHandle | null> {
  const handle = await (globalThis as any).showSaveFilePicker({
    suggestedName,
    types: [{ description: 'gen-spec JSON', accept: { 'application/json': ['.json', '.gen-spec.json'] } }],
  });
  return handle ?? null;
}

export async function readFile(handle: FileHandle): Promise<{ text: string; name: string }> {
  const f = await handle.getFile();
  return { text: await f.text(), name: f.name };
}

export async function writeFile(text: string, handle: FileHandle): Promise<void> {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function uploadFile(accept = '.json,.gen-spec.json,application/json'): Promise<{ text: string; name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ text: await f.text(), name: f.name });
    };
    input.click();
  });
}
```

Run: `pnpm --filter web test tests/storage/file.test.ts` → PASS.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/storage/file.ts apps/web/tests/storage/file.test.ts
git commit -m "feat(storage): File System Access wrapper with download/upload fallback"
```

---

### Task 5: Zustand store + app shell with Open/Save/New

**Files:**
- Create: `apps/web/src/state/store.ts`
- Create: `apps/web/src/ui/AppHeader.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/tests/state/store.test.ts`, `apps/web/tests/ui/AppHeader.test.tsx`

**Acceptance criteria:** storage #1, #2, #3, #4, #5.

- [x] **Step 1: Write store tests**

`apps/web/tests/state/store.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import { clearDraft, loadDraft } from '../../src/storage/drafts';

beforeEach(async () => {
  await clearDraft();
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false });
});

test('setSpec marks dirty and writes draft', async () => {
  const next = emptySpec('Renamed');
  await useSpecStore.getState().setSpec(next);
  expect(useSpecStore.getState().dirty).toBe(true);
  expect(await loadDraft()).toEqual(next);
});

test('newSpec resets state and clears draft', async () => {
  await useSpecStore.getState().setSpec(emptySpec('X'));
  await useSpecStore.getState().newSpec();
  expect(useSpecStore.getState().spec.info.name).toBe('Untitled API');
  expect(await loadDraft()).toBeNull();
});
```

- [x] **Step 2: Implement store**

`apps/web/src/state/store.ts`:
```ts
import { create } from 'zustand';
import { Spec } from '../schema/types';
import { emptySpec } from '../schema/defaults';
import { clearDraft, loadDraft, saveDraft } from '../storage/drafts';
import { FileHandle } from '../storage/file';

interface SpecStore {
  spec: Spec;
  fileHandle: FileHandle | null;
  dirty: boolean;
  selectedEndpointId: string | null;
  setSpec(next: Spec): Promise<void>;
  replaceSpec(next: Spec, handle: FileHandle | null): Promise<void>;
  newSpec(): Promise<void>;
  markSaved(handle: FileHandle | null): Promise<void>;
  restoreDraft(): Promise<boolean>;
  discardDraft(): Promise<{ reloadedFromFile: boolean }>;
  selectEndpoint(id: string | null): void;
}

export const useSpecStore = create<SpecStore>((set, get) => ({
  spec: emptySpec(),
  fileHandle: null,
  dirty: false,
  selectedEndpointId: null,
  async setSpec(next) {
    set({ spec: next, dirty: true });
    await saveDraft(next);
  },
  async replaceSpec(next, handle) {
    set({ spec: next, fileHandle: handle, dirty: false });
    await clearDraft();
  },
  async newSpec() {
    set({ spec: emptySpec(), fileHandle: null, dirty: false, selectedEndpointId: null });
    await clearDraft();
  },
  async markSaved(handle) {
    set({ fileHandle: handle, dirty: false });
    await clearDraft();
  },
  async restoreDraft() {
    const draft = await loadDraft();
    if (!draft) return false;
    set({ spec: draft, dirty: true });
    return true;
  },
  async discardDraft() {
    await clearDraft();
    const handle = get().fileHandle;
    if (handle) {
      // lazy-import to avoid a cycle with AppHeader
      const { readFile } = await import('../storage/file');
      const { fromJSON } = await import('../schema/serialize');
      const { text } = await readFile(handle);
      set({ spec: fromJSON(JSON.parse(text)), dirty: false });
      return { reloadedFromFile: true };
    }
    // no file handle: reset to an empty spec (caller may prompt "Open")
    set({ spec: emptySpec(), dirty: false, selectedEndpointId: null });
    return { reloadedFromFile: false };
  },
  selectEndpoint(id) { set({ selectedEndpointId: id }); },
}));
```

Add a store test for `discardDraft`:

`apps/web/tests/state/store.test.ts` (append):
```ts
test('discardDraft clears draft and resets spec when no file handle', async () => {
  await useSpecStore.getState().setSpec(emptySpec('Dirty'));
  const res = await useSpecStore.getState().discardDraft();
  expect(res.reloadedFromFile).toBe(false);
  expect(useSpecStore.getState().spec.info.name).toBe('Untitled API');
  expect(await loadDraft()).toBeNull();
});
```

- [x] **Step 3: Build the header**

`apps/web/src/ui/AppHeader.tsx`:
```tsx
import { useSpecStore } from '../state/store';
import { fromJSON, toJSON } from '../schema/serialize';
import {
  downloadBlob, pickOpen, pickSave, readFile, supportsFileSystemAccess,
  uploadFile, writeFile,
} from '../storage/file';

export function AppHeader() {
  const { spec, fileHandle, dirty, replaceSpec, newSpec, markSaved, discardDraft } = useSpecStore();

  async function openSpec() {
    if (supportsFileSystemAccess()) {
      const h = await pickOpen();
      if (!h) return;
      const { text } = await readFile(h);
      await replaceSpec(fromJSON(JSON.parse(text)), h);
    } else {
      const up = await uploadFile();
      if (!up) return;
      await replaceSpec(fromJSON(JSON.parse(up.text)), null);
    }
  }

  async function saveSpec() {
    const text = toJSON(spec);
    if (fileHandle) {
      await writeFile(text, fileHandle);
      await markSaved(fileHandle);
      return;
    }
    if (supportsFileSystemAccess()) {
      const h = await pickSave();
      if (!h) return;
      await writeFile(text, h);
      await markSaved(h);
    } else {
      downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.gen-spec.json');
      await markSaved(null);
    }
  }

  async function onDiscard() {
    if (!confirm('Discard unsaved changes and reload from the source file?')) return;
    const { reloadedFromFile } = await discardDraft();
    if (!reloadedFromFile) alert('No source file attached — draft cleared and spec reset. Use "Open" to load one.');
  }

  return (
    <header className="flex items-center gap-2 border-b bg-white px-4 py-2">
      <h1 className="mr-auto text-lg font-semibold">
        gen-spec — <span className="font-normal">{spec.info.name}</span>
        {dirty && <span className="ml-1 text-amber-600" aria-label="unsaved changes">•</span>}
      </h1>
      <button className="rounded border px-2 py-1" onClick={() => void newSpec()}>New</button>
      <button className="rounded border px-2 py-1" onClick={() => void openSpec()}>Open</button>
      {dirty && (
        <button className="rounded border px-2 py-1" onClick={() => void onDiscard()}>Discard draft</button>
      )}
      <button className="rounded border bg-slate-900 px-2 py-1 text-white" onClick={() => void saveSpec()}>Save</button>
    </header>
  );
}
```

Update `apps/web/src/App.tsx`:
```tsx
import { useEffect } from 'react';
import { AppHeader } from './ui/AppHeader';
import { useSpecStore } from './state/store';

export function App() {
  const restoreDraft = useSpecStore((s) => s.restoreDraft);
  useEffect(() => { void restoreDraft(); }, [restoreDraft]);
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="p-6 text-sm text-slate-700">Open or create a spec to get started.</main>
    </div>
  );
}
```

- [x] **Step 4: Component test**

`apps/web/tests/ui/AppHeader.test.tsx`:
```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('New replaces current spec', async () => {
  useSpecStore.setState({ spec: emptySpec('Old'), fileHandle: null, dirty: true });
  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'New' }));
  expect(useSpecStore.getState().spec.info.name).toBe('Untitled API');
});
```

Run tests: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/state apps/web/src/ui apps/web/src/App.tsx apps/web/tests/state apps/web/tests/ui
git commit -m "feat(app): Zustand store and app header with New/Open/Save"
```

---

### Task 6: Type builder UI (recursive editor)

**Files:**
- Create: `apps/web/src/ui/TypeBuilder.tsx`
- Test: `apps/web/tests/ui/TypeBuilder.test.tsx`

**Acceptance criteria:** type builder #1, #2, #3, #4, #5, #6.

- [x] **Step 1: Test the basic rendering and kind switching**

`apps/web/tests/ui/TypeBuilder.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { TypeBuilder } from '../../src/ui/TypeBuilder';
import type { TypeDef } from '../../src/schema/types';

function Harness({ initial }: { initial: TypeDef }) {
  const [t, setT] = useState<TypeDef>(initial);
  return <TypeBuilder value={t} onChange={setT} typeNames={[]} />;
}

test('switches kind', async () => {
  render(<Harness initial={{ kind: 'string' }} />);
  const select = screen.getByLabelText('Kind');
  await userEvent.selectOptions(select, 'integer');
  expect((select as HTMLSelectElement).value).toBe('integer');
});

test('adds object field', async () => {
  render(<Harness initial={{ kind: 'object', fields: [] }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Add field' }));
  expect(screen.getByLabelText('Field name')).toBeInTheDocument();
});

test('string constraints render', () => {
  render(<Harness initial={{ kind: 'string' }} />);
  expect(screen.getByLabelText('min length')).toBeInTheDocument();
  expect(screen.getByLabelText('pattern')).toBeInTheDocument();
});
```

- [x] **Step 2: Implement recursive builder**

`apps/web/src/ui/TypeBuilder.tsx`:
```tsx
import { TypeDef, ObjectField } from '../schema/types';

const KINDS: Array<TypeDef['kind']> = [
  'string','number','integer','boolean','null','literal','array','object','union','ref',
];

function defaultFor(kind: TypeDef['kind'], typeNames: string[]): TypeDef {
  switch (kind) {
    case 'string': return { kind: 'string' };
    case 'number': return { kind: 'number' };
    case 'integer': return { kind: 'integer' };
    case 'boolean': return { kind: 'boolean' };
    case 'null': return { kind: 'null' };
    case 'literal': return { kind: 'literal', value: '' };
    case 'array': return { kind: 'array', element: { kind: 'string' } };
    case 'object': return { kind: 'object', fields: [] };
    case 'union': return { kind: 'union', variants: [{ kind: 'string' }] };
    case 'ref': return { kind: 'ref', ref: typeNames[0] ?? '' };
  }
}

interface Props {
  value: TypeDef;
  onChange(next: TypeDef): void;
  typeNames: string[];
}

export function TypeBuilder({ value, onChange, typeNames }: Props) {
  const patch = (p: Partial<TypeDef>) => onChange({ ...(value as any), ...p });

  return (
    <div className="rounded border p-2 text-sm">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          <span>Kind</span>
          <select
            aria-label="Kind"
            value={value.kind}
            onChange={(e) => onChange(defaultFor(e.target.value as TypeDef['kind'], typeNames))}
            className="border rounded px-1"
          >
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span>desc</span>
          <input
            aria-label="description"
            className="border rounded px-1"
            value={value.description ?? ''}
            onChange={(e) => patch({ description: e.target.value || undefined } as any)}
          />
        </label>
      </div>

      {value.kind === 'string' && (
        <StringConstraints value={value} onChange={patch as any} />
      )}
      {(value.kind === 'number' || value.kind === 'integer') && (
        <NumberConstraints value={value} onChange={patch as any} />
      )}
      {value.kind === 'array' && (
        <ArrayControls value={value} onChange={onChange} typeNames={typeNames} />
      )}
      {value.kind === 'object' && (
        <ObjectControls value={value} onChange={onChange} typeNames={typeNames} />
      )}
      {value.kind === 'union' && (
        <UnionControls value={value} onChange={onChange} typeNames={typeNames} />
      )}
      {value.kind === 'literal' && (
        <LiteralControls value={value} onChange={patch as any} />
      )}
      {value.kind === 'ref' && (
        <RefControls value={value} onChange={patch as any} typeNames={typeNames} />
      )}
    </div>
  );
}

function numInput(label: string, v: number | undefined, set: (n?: number) => void) {
  return (
    <label className="flex items-center gap-1">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={v ?? ''}
        onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
        className="border rounded px-1 w-20"
      />
    </label>
  );
}

function StringConstraints({ value, onChange }: any) {
  const v = value;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {numInput('min length', v.minLength, (n) => onChange({ minLength: n }))}
      {numInput('max length', v.maxLength, (n) => onChange({ maxLength: n }))}
      <label className="flex items-center gap-1">
        <span>pattern</span>
        <input
          aria-label="pattern"
          className="border rounded px-1"
          value={v.pattern ?? ''}
          onChange={(e) => onChange({ pattern: e.target.value || undefined })}
        />
      </label>
      <EnumField value={v.enum ?? []} onChange={(e) => onChange({ enum: e.length ? e : undefined })} parse={(s) => s} />
    </div>
  );
}

function NumberConstraints({ value, onChange }: any) {
  const v = value;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {numInput('min', v.min, (n) => onChange({ min: n }))}
      {numInput('max', v.max, (n) => onChange({ max: n }))}
      <EnumField
        value={(v.enum ?? []).map(String)}
        onChange={(e) => onChange({ enum: e.length ? e.map(Number) : undefined })}
        parse={(s) => Number(s)}
      />
    </div>
  );
}

function EnumField({ value, onChange, parse }: { value: string[]; onChange(v: string[]): void; parse: (s: string) => unknown }) {
  return (
    <label className="flex items-center gap-1">
      <span>enum</span>
      <input
        aria-label="enum"
        placeholder="comma-separated"
        className="border rounded px-1"
        value={value.join(',')}
        onChange={(e) => onChange(e.target.value ? e.target.value.split(',').map((s) => s.trim()) : [])}
      />
    </label>
  );
}

function ArrayControls({ value, onChange, typeNames }: any) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        {numInput('min items', value.minItems, (n) => onChange({ ...value, minItems: n }))}
        {numInput('max items', value.maxItems, (n) => onChange({ ...value, maxItems: n }))}
      </div>
      <div>
        <div className="text-xs text-slate-500">element</div>
        <TypeBuilder
          value={value.element}
          onChange={(el) => onChange({ ...value, element: el })}
          typeNames={typeNames}
        />
      </div>
    </div>
  );
}

function ObjectControls({ value, onChange, typeNames }: any) {
  const setField = (i: number, patch: Partial<ObjectField>) => {
    const next = value.fields.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, fields: next });
  };
  return (
    <div className="mt-2 space-y-2">
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={!!value.strict}
          onChange={(e) => onChange({ ...value, strict: e.target.checked || undefined })}
        />
        strict (fail on unknown fields)
      </label>
      {value.fields.map((f: ObjectField, i: number) => (
        <div key={i} className="border-l-2 border-slate-200 pl-2 space-y-1">
          <div className="flex gap-2">
            <label className="flex items-center gap-1">
              <span>name</span>
              <input
                aria-label="Field name"
                className="border rounded px-1"
                value={f.name}
                onChange={(e) => setField(i, { name: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => setField(i, { required: e.target.checked })}
              />
              required
            </label>
            <button
              className="text-red-600"
              onClick={() => onChange({ ...value, fields: value.fields.filter((_: unknown, j: number) => j !== i) })}
            >remove</button>
          </div>
          <TypeBuilder value={f.type} onChange={(t) => setField(i, { type: t })} typeNames={typeNames} />
        </div>
      ))}
      <button
        className="rounded border px-2 py-1"
        onClick={() => onChange({ ...value, fields: [...value.fields, { name: '', required: true, type: { kind: 'string' } }] })}
      >Add field</button>
    </div>
  );
}

function UnionControls({ value, onChange, typeNames }: any) {
  return (
    <div className="mt-2 space-y-2">
      {value.variants.map((v: any, i: number) => (
        <div key={i} className="flex gap-2">
          <div className="flex-1">
            <TypeBuilder
              value={v}
              onChange={(next) => {
                const variants = value.variants.slice();
                variants[i] = next;
                onChange({ ...value, variants });
              }}
              typeNames={typeNames}
            />
          </div>
          <button
            className="text-red-600"
            onClick={() => onChange({ ...value, variants: value.variants.filter((_: unknown, j: number) => j !== i) })}
          >remove</button>
        </div>
      ))}
      <button
        className="rounded border px-2 py-1"
        onClick={() => onChange({ ...value, variants: [...value.variants, { kind: 'string' }] })}
      >Add variant</button>
    </div>
  );
}

function LiteralControls({ value, onChange }: any) {
  return (
    <label className="mt-2 flex items-center gap-1">
      <span>value</span>
      <input
        aria-label="literal value"
        className="border rounded px-1"
        value={String(value.value)}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </label>
  );
}

function RefControls({ value, onChange, typeNames }: any) {
  return (
    <label className="mt-2 flex items-center gap-1">
      <span>ref</span>
      <select
        aria-label="ref"
        className="border rounded px-1"
        value={value.ref}
        onChange={(e) => onChange({ ref: e.target.value })}
      >
        {typeNames.map((n: string) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
```

Run: `pnpm --filter web test tests/ui/TypeBuilder.test.tsx` → PASS.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/ui/TypeBuilder.tsx apps/web/tests/ui/TypeBuilder.test.tsx
git commit -m "feat(ui): recursive TypeBuilder component"
```

---

### Task 7: Named Types panel + rename propagation

**Files:**
- Create: `apps/web/src/schema/rename.ts`, `apps/web/src/ui/TypePanel.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/tests/schema/rename.test.ts`, `apps/web/tests/ui/TypePanel.test.tsx`

**Acceptance criteria:** type builder #7, #8; edge case "Reference to deleted named type".

- [x] **Step 1: Test rename logic**

`apps/web/tests/schema/rename.test.ts`:
```ts
import { expect, test } from 'vitest';
import { renameType, collectBrokenRefs } from '../../src/schema/rename';
import { emptySpec } from '../../src/schema/defaults';

test('renames a type and updates refs deeply', () => {
  const spec = emptySpec();
  spec.types.User = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/u', pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const next = renameType(spec, 'User', 'Account');
  expect(next.types.Account).toBeDefined();
  expect(next.types.User).toBeUndefined();
  expect(next.endpoints[0].responses[0].type).toEqual({ kind: 'ref', ref: 'Account' });
});

test('collectBrokenRefs finds dangling references', () => {
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/x', pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'ref', ref: 'Missing' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  expect(collectBrokenRefs(spec)).toEqual([
    { location: 'endpoint:e1:requestBody', ref: 'Missing' },
  ]);
});
```

- [x] **Step 2: Implement**

`apps/web/src/schema/rename.ts`:
```ts
import { Spec, TypeDef } from './types';

function walk(t: TypeDef, fn: (t: TypeDef) => TypeDef): TypeDef {
  const next = fn(t);
  switch (next.kind) {
    case 'array':
      return { ...next, element: walk(next.element, fn) };
    case 'object':
      return { ...next, fields: next.fields.map((f) => ({ ...f, type: walk(f.type, fn) })) };
    case 'union':
      return { ...next, variants: next.variants.map((v) => walk(v, fn)) };
    default:
      return next;
  }
}

export function renameType(spec: Spec, from: string, to: string): Spec {
  if (!spec.types[from] || from === to) return spec;
  const rewrite = (t: TypeDef): TypeDef =>
    t.kind === 'ref' && t.ref === from ? { ...t, ref: to } : t;

  const types: Record<string, TypeDef> = {};
  for (const [k, v] of Object.entries(spec.types)) {
    const newKey = k === from ? to : k;
    types[newKey] = walk(v, rewrite);
  }

  const endpoints = spec.endpoints.map((e) => ({
    ...e,
    requestBody: e.requestBody ? walk(e.requestBody, rewrite) : null,
    pathParams: e.pathParams.map((p) => ({ ...p, type: walk(p.type, rewrite) })),
    queryParams: e.queryParams.map((p) => ({ ...p, type: walk(p.type, rewrite) })),
    headers: e.headers.map((p) => ({ ...p, type: walk(p.type, rewrite) })),
    responses: e.responses.map((r) => ({ ...r, type: walk(r.type, rewrite) })),
  }));

  return { ...spec, types, endpoints };
}

export interface BrokenRef { location: string; ref: string }

export function collectBrokenRefs(spec: Spec): BrokenRef[] {
  const known = new Set(Object.keys(spec.types));
  const out: BrokenRef[] = [];
  const visit = (t: TypeDef, location: string) => {
    walk(t, (sub) => {
      if (sub.kind === 'ref' && !known.has(sub.ref)) out.push({ location, ref: sub.ref });
      return sub;
    });
  };
  for (const [name, t] of Object.entries(spec.types)) visit(t, `types:${name}`);
  for (const e of spec.endpoints) {
    if (e.requestBody) visit(e.requestBody, `endpoint:${e.id}:requestBody`);
    e.pathParams.forEach((p, i) => visit(p.type, `endpoint:${e.id}:pathParams[${i}]`));
    e.queryParams.forEach((p, i) => visit(p.type, `endpoint:${e.id}:queryParams[${i}]`));
    e.headers.forEach((p, i) => visit(p.type, `endpoint:${e.id}:headers[${i}]`));
    e.responses.forEach((r, i) => visit(r.type, `endpoint:${e.id}:responses[${i}]`));
  }
  return out;
}
```

- [x] **Step 3: Build panel**

`apps/web/src/ui/TypePanel.tsx`:
```tsx
import { useState } from 'react';
import { useSpecStore } from '../state/store';
import { TypeBuilder } from './TypeBuilder';
import { renameType, collectBrokenRefs } from '../schema/rename';

export function TypePanel() {
  const { spec, setSpec } = useSpecStore();
  const typeNames = Object.keys(spec.types).sort();
  const [selected, setSelected] = useState<string | null>(typeNames[0] ?? null);
  const broken = collectBrokenRefs(spec);

  async function addType() {
    let name = 'NewType';
    let i = 1;
    while (spec.types[name]) name = `NewType${i++}`;
    await setSpec({ ...spec, types: { ...spec.types, [name]: { kind: 'object', fields: [] } } });
    setSelected(name);
  }

  async function rename(oldName: string, newName: string) {
    if (!newName || spec.types[newName]) return;
    await setSpec(renameType(spec, oldName, newName));
    setSelected(newName);
  }

  async function remove(name: string) {
    const { [name]: _, ...rest } = spec.types;
    await setSpec({ ...spec, types: rest });
    if (selected === name) setSelected(Object.keys(rest)[0] ?? null);
  }

  const current = selected ? spec.types[selected] : null;

  return (
    <section className="border-r bg-white p-3 text-sm w-72">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Types</h2>
        <button className="rounded border px-2 py-0.5" onClick={() => void addType()}>+</button>
      </div>
      {broken.length > 0 && (
        <div role="alert" className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">
          {broken.length} broken ref(s):
          <ul>{broken.map((b, i) => <li key={i}>{b.location}: {b.ref}</li>)}</ul>
        </div>
      )}
      <ul className="mb-2 space-y-1">
        {typeNames.map((n) => (
          <li key={n} className={n === selected ? 'font-semibold' : ''}>
            <button className="text-left" onClick={() => setSelected(n)}>{n}</button>
          </li>
        ))}
      </ul>
      {selected && current && (
        <div>
          <div className="mb-2 flex gap-2">
            <input
              aria-label="Type name"
              className="border rounded px-1 flex-1"
              defaultValue={selected}
              onBlur={(e) => void rename(selected, e.target.value)}
            />
            <button className="text-red-600" onClick={() => void remove(selected)}>delete</button>
          </div>
          <TypeBuilder
            value={current}
            onChange={(t) => void setSpec({ ...spec, types: { ...spec.types, [selected]: t } })}
            typeNames={typeNames.filter((n) => n !== selected)}
          />
        </div>
      )}
    </section>
  );
}
```

Update `App.tsx` to render `<TypePanel />` beside main content:

```tsx
import { useEffect } from 'react';
import { AppHeader } from './ui/AppHeader';
import { TypePanel } from './ui/TypePanel';
import { useSpecStore } from './state/store';

export function App() {
  const restoreDraft = useSpecStore((s) => s.restoreDraft);
  useEffect(() => { void restoreDraft(); }, [restoreDraft]);
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="flex flex-1">
        <TypePanel />
        <main className="flex-1 p-6 text-sm text-slate-700">Select or create an endpoint.</main>
      </div>
    </div>
  );
}
```

**Block Save when broken refs exist.** Update `AppHeader.tsx` to import `collectBrokenRefs` and gate `saveSpec`:

```tsx
// apps/web/src/ui/AppHeader.tsx (add to imports)
import { collectBrokenRefs } from '../schema/rename';

// replace the beginning of saveSpec() with:
async function saveSpec() {
  const broken = collectBrokenRefs(spec);
  if (broken.length > 0) {
    alert(`Cannot save: ${broken.length} broken type reference(s). Fix them in the Types panel.`);
    return;
  }
  const text = toJSON(spec);
  // ...rest unchanged
}
```

Add a test for the save-block behavior:

`apps/web/tests/ui/AppHeader.brokenRefs.test.tsx`:
```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('Save is blocked when the spec has broken refs', async () => {
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'ref', ref: 'Missing' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  useSpecStore.setState({ spec, fileHandle: null, dirty: true, selectedEndpointId: null });
  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('broken type reference'));
  alertSpy.mockRestore();
});
```

- [x] **Step 4: Component test**

`apps/web/tests/ui/TypePanel.test.tsx`:
```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypePanel } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('add and rename a type updates refs', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: { User: { kind: 'object', fields: [] } },
      endpoints: [{
        id: 'e1', method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null,
        responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
        auth: 'inherit', useProxy: 'inherit',
      }],
    },
    fileHandle: null, dirty: false,
  });
  render(<TypePanel />);
  const input = screen.getByLabelText('Type name') as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, 'Account');
  input.blur();
  await screen.findByText('Account');
  const { endpoints } = useSpecStore.getState().spec;
  expect(endpoints[0].responses[0].type).toEqual({ kind: 'ref', ref: 'Account' });
});
```

Run tests: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/schema/rename.ts apps/web/src/ui/TypePanel.tsx apps/web/tests/schema/rename.test.ts apps/web/tests/ui/TypePanel.test.tsx apps/web/src/App.tsx
git commit -m "feat(types): named types panel with rename propagation"
```

---

### Task 8: Runtime validator (cycle-safe) + cycles rule

**Files:**
- Create: `apps/web/src/validator/validate.ts`
- Create: `docs/rules/validator-cycles.md`
- Test: `apps/web/tests/validator/validate.test.ts`

**Acceptance criteria:** runner #3, #4; edge cases "Circular type references", "Unknown fields in response".

- [x] **Step 1: Write the cycles rule**

`docs/rules/validator-cycles.md`:
```markdown
# Validator Cycle Handling

The runtime validator walks user-defined types. Named types can reference each other, including directly or indirectly cyclically (e.g., `TreeNode { children: TreeNode[] }`).

Rules:
- The validator MUST dereference `ref` types by looking up the named type in `spec.types` at validation time, not during schema creation.
- The validator MUST NOT recurse on types alone. Recursion must walk the **value** being validated: each recursive call consumes either a narrower value (array element, object field) or a narrower type (union variant). Since values are finite, the validator terminates.
- Unknown fields on an `object` pass by default; if the object has `strict: true`, unknown fields produce an error at path `fieldname` of kind `unknown-field`.
```

- [x] **Step 2: Write failing tests**

`apps/web/tests/validator/validate.test.ts`:
```ts
import { expect, test } from 'vitest';
import { validate } from '../../src/validator/validate';
import type { Spec, TypeDef } from '../../src/schema/types';
import { emptySpec } from '../../src/schema/defaults';

const spec = (): Spec => emptySpec();

test('primitive pass/fail', () => {
  expect(validate(spec(), { kind: 'string' }, 'hi')).toEqual([]);
  expect(validate(spec(), { kind: 'string' }, 3)).toEqual([
    { path: '', message: 'expected string, got number' },
  ]);
});

test('integer rejects fractional', () => {
  expect(validate(spec(), { kind: 'integer' }, 1.5)[0].message).toMatch(/integer/);
});

test('string constraints', () => {
  const t: TypeDef = { kind: 'string', minLength: 2, pattern: '^[a-z]+$' };
  expect(validate(spec(), t, 'a')[0].message).toMatch(/minLength/);
  expect(validate(spec(), t, 'AB')[0].message).toMatch(/pattern/);
  expect(validate(spec(), t, 'ok')).toEqual([]);
});

test('array element errors carry index in path', () => {
  const t: TypeDef = { kind: 'array', element: { kind: 'number' } };
  expect(validate(spec(), t, [1, 'two', 3])).toEqual([
    { path: '[1]', message: 'expected number, got string' },
  ]);
});

test('object missing required', () => {
  const t: TypeDef = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  expect(validate(spec(), t, {})).toEqual([
    { path: 'id', message: 'missing required field' },
  ]);
});

test('object strict flags unknown', () => {
  const t: TypeDef = { kind: 'object', strict: true, fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  expect(validate(spec(), t, { id: 'x', extra: 1 })).toEqual([
    { path: 'extra', message: 'unknown field' },
  ]);
});

test('union: ok if any variant passes', () => {
  const t: TypeDef = { kind: 'union', variants: [{ kind: 'string' }, { kind: 'number' }] };
  expect(validate(spec(), t, 1)).toEqual([]);
  expect(validate(spec(), t, true)[0].message).toMatch(/none of/);
});

test('cyclic ref terminates and validates', () => {
  const s = spec();
  s.types.Tree = {
    kind: 'object',
    fields: [
      { name: 'v', required: true, type: { kind: 'number' } },
      { name: 'children', required: true, type: { kind: 'array', element: { kind: 'ref', ref: 'Tree' } } },
    ],
  };
  const value = { v: 1, children: [{ v: 2, children: [] }] };
  expect(validate(s, { kind: 'ref', ref: 'Tree' }, value)).toEqual([]);
  const bad = { v: 1, children: [{ v: 'two', children: [] }] };
  expect(validate(s, { kind: 'ref', ref: 'Tree' }, bad)).toEqual([
    { path: 'children[0].v', message: 'expected number, got string' },
  ]);
});

test('dangling ref reports error', () => {
  expect(validate(spec(), { kind: 'ref', ref: 'Missing' }, {})[0].message).toMatch(/unknown type/);
});
```

Run: FAIL.

- [x] **Step 3: Implement**

`apps/web/src/validator/validate.ts`:
```ts
import type { Spec, TypeDef } from '../schema/types';

export interface ValidationError { path: string; message: string }

export function validate(spec: Spec, type: TypeDef, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  check(spec, type, value, '', errors);
  return errors;
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function deref(spec: Spec, t: TypeDef): TypeDef | null {
  let cur: TypeDef = t;
  while (cur.kind === 'ref') {
    const next = spec.types[cur.ref];
    if (!next) return null;
    cur = next;
  }
  return cur;
}

function check(spec: Spec, t: TypeDef, v: unknown, path: string, errs: ValidationError[]): void {
  const push = (message: string, subPath = path) => errs.push({ path: subPath, message });

  if (t.kind === 'ref') {
    const resolved = deref(spec, t);
    if (!resolved) return push(`unknown type '${t.ref}'`);
    return check(spec, resolved, v, path, errs);
  }

  switch (t.kind) {
    case 'string': {
      if (typeof v !== 'string') return push(`expected string, got ${typeName(v)}`);
      if (t.minLength != null && v.length < t.minLength) push(`minLength ${t.minLength}`);
      if (t.maxLength != null && v.length > t.maxLength) push(`maxLength ${t.maxLength}`);
      if (t.pattern && !new RegExp(t.pattern).test(v)) push(`pattern ${t.pattern}`);
      if (t.enum && !t.enum.includes(v)) push(`enum mismatch (allowed: ${t.enum.join(', ')})`);
      return;
    }
    case 'number':
    case 'integer': {
      if (typeof v !== 'number' || Number.isNaN(v)) return push(`expected ${t.kind}, got ${typeName(v)}`);
      if (t.kind === 'integer' && !Number.isInteger(v)) return push('expected integer');
      if (t.min != null && v < t.min) push(`min ${t.min}`);
      if (t.max != null && v > t.max) push(`max ${t.max}`);
      if (t.enum && !t.enum.includes(v)) push(`enum mismatch`);
      return;
    }
    case 'boolean':
      if (typeof v !== 'boolean') push(`expected boolean, got ${typeName(v)}`);
      return;
    case 'null':
      if (v !== null) push(`expected null, got ${typeName(v)}`);
      return;
    case 'literal':
      if (v !== t.value) push(`expected literal ${JSON.stringify(t.value)}, got ${JSON.stringify(v)}`);
      return;
    case 'array': {
      if (!Array.isArray(v)) return push(`expected array, got ${typeName(v)}`);
      if (t.minItems != null && v.length < t.minItems) push(`minItems ${t.minItems}`);
      if (t.maxItems != null && v.length > t.maxItems) push(`maxItems ${t.maxItems}`);
      v.forEach((item, i) => check(spec, t.element, item, `${path}[${i}]`, errs));
      return;
    }
    case 'object': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return push(`expected object, got ${typeName(v)}`);
      const obj = v as Record<string, unknown>;
      const allowed = new Set(t.fields.map((f) => f.name));
      for (const f of t.fields) {
        const child = path ? `${path}.${f.name}` : f.name;
        if (!(f.name in obj)) {
          if (f.required) errs.push({ path: child, message: 'missing required field' });
          continue;
        }
        check(spec, f.type, obj[f.name], child, errs);
      }
      if (t.strict) {
        for (const k of Object.keys(obj)) {
          if (!allowed.has(k)) errs.push({ path: path ? `${path}.${k}` : k, message: 'unknown field' });
        }
      }
      return;
    }
    case 'union': {
      const allErrs: ValidationError[][] = [];
      for (const variant of t.variants) {
        const sub: ValidationError[] = [];
        check(spec, variant, v, path, sub);
        if (sub.length === 0) return;
        allErrs.push(sub);
      }
      push(`none of ${t.variants.length} union variants matched`);
      return;
    }
  }
}
```

Run tests: PASS.

- [x] **Step 4: Commit**

```bash
git add docs/rules/validator-cycles.md apps/web/src/validator apps/web/tests/validator
git commit -m "feat(validator): cycle-safe runtime validator"
```

---

### Task 9: Endpoint list + editor (method/path/description)

**Files:**
- Create: `apps/web/src/ui/EndpointList.tsx`, `apps/web/src/ui/EndpointEditor.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/tests/ui/EndpointEditor.test.tsx`

**Acceptance criteria:** endpoint editor #1.

- [x] **Step 1: Tests**

`apps/web/tests/ui/EndpointEditor.test.tsx`:
```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointList } from '../../src/ui/EndpointList';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('add endpoint and edit path', async () => {
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false });
  render(<><EndpointList /><EndpointEditor /></>);
  await userEvent.click(screen.getByRole('button', { name: 'New endpoint' }));
  const path = screen.getByLabelText('Path') as HTMLInputElement;
  await userEvent.clear(path);
  await userEvent.type(path, '/users/{id}');
  expect(useSpecStore.getState().spec.endpoints[0].path).toBe('/users/{id}');
});
```

- [x] **Step 2: Implement EndpointList**

`apps/web/src/ui/EndpointList.tsx`:
```tsx
import { useSpecStore } from '../state/store';

export function EndpointList() {
  const { spec, setSpec } = useSpecStore();
  const selected = useSpecStore((s) => s.selectedEndpointId);
  const select = useSpecStore((s) => s.selectEndpoint);

  async function add() {
    const id = crypto.randomUUID();
    await setSpec({
      ...spec,
      endpoints: [...spec.endpoints, {
        id, method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
      }],
    });
    select(id);
  }

  return (
    <aside className="w-64 border-r p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Endpoints</h2>
        <button className="rounded border px-2 py-0.5" onClick={() => void add()}>New endpoint</button>
      </div>
      <ul className="space-y-1 text-sm">
        {spec.endpoints.map((e) => (
          <li key={e.id}>
            <button
              className={`text-left ${e.id === selected ? 'font-semibold' : ''}`}
              onClick={() => select(e.id)}
            >
              <span className="mr-2 font-mono text-xs">{e.method}</span>{e.path}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

(Selection state — `selectedEndpointId: string | null` and `selectEndpoint(id)` — was already introduced in Task 5's `store.ts`. No further store changes are needed for this task.)

- [x] **Step 3: Implement EndpointEditor (basics section only for now)**

`apps/web/src/ui/EndpointEditor.tsx`:
```tsx
import { useSpecStore } from '../state/store';
import { HttpMethod } from '../schema/types';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function EndpointEditor() {
  const { spec, setSpec, selectedEndpointId } = useSpecStore();
  const endpoint = spec.endpoints.find((e) => e.id === selectedEndpointId);
  if (!endpoint) return <main className="flex-1 p-6 text-sm text-slate-500">Select or create an endpoint.</main>;

  const patch = (p: Partial<typeof endpoint>) => void setSpec({
    ...spec,
    endpoints: spec.endpoints.map((e) => e.id === endpoint.id ? { ...e, ...p } : e),
  });

  return (
    <main className="flex-1 p-6 space-y-4">
      <div className="flex gap-2">
        <label>Method
          <select
            aria-label="Method"
            className="border rounded px-1 ml-1"
            value={endpoint.method}
            onChange={(e) => patch({ method: e.target.value as HttpMethod })}
          >
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="flex-1">Path
          <input
            aria-label="Path"
            className="ml-1 border rounded px-1 w-full"
            value={endpoint.path}
            onChange={(e) => patch({ path: e.target.value })}
          />
        </label>
      </div>
      <label className="block">Description
        <textarea
          aria-label="Description"
          className="w-full border rounded px-1"
          value={endpoint.description ?? ''}
          onChange={(e) => patch({ description: e.target.value || undefined })}
        />
      </label>
      {/* Further sections added in later tasks */}
    </main>
  );
}
```

Run test: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/ui/EndpointList.tsx apps/web/src/ui/EndpointEditor.tsx apps/web/src/state/store.ts apps/web/src/App.tsx apps/web/tests/ui/EndpointEditor.test.tsx
git commit -m "feat(endpoints): list and base editor for method/path/description"
```

---

### Task 10: Param editor (path, query, headers)

**Files:**
- Create: `apps/web/src/ui/ParamTable.tsx`
- Modify: `apps/web/src/ui/EndpointEditor.tsx`
- Test: `apps/web/tests/ui/ParamTable.test.tsx`

**Acceptance criteria:** endpoint editor #2.

- [x] **Step 1: Test**

`apps/web/tests/ui/ParamTable.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ParamTable } from '../../src/ui/ParamTable';
import { ParamDef } from '../../src/schema/types';

function Harness() {
  const [ps, setPs] = useState<ParamDef[]>([]);
  return <ParamTable title="Query" value={ps} onChange={setPs} typeNames={[]} />;
}

test('adds a param and edits name', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Add param' }));
  const name = screen.getByLabelText('Param name') as HTMLInputElement;
  await userEvent.type(name, 'page');
  expect(name.value).toBe('page');
});
```

- [x] **Step 2: Implement**

`apps/web/src/ui/ParamTable.tsx`:
```tsx
import { ParamDef } from '../schema/types';
import { TypeBuilder } from './TypeBuilder';

interface Props {
  title: string;
  value: ParamDef[];
  onChange(next: ParamDef[]): void;
  typeNames: string[];
}

export function ParamTable({ title, value, onChange, typeNames }: Props) {
  const patch = (i: number, p: Partial<ParamDef>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...p };
    onChange(next);
  };

  return (
    <section className="border rounded p-2">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        <button
          className="rounded border px-2 py-0.5"
          onClick={() => onChange([...value, { name: '', required: true, type: { kind: 'string' } }])}
        >Add param</button>
      </div>
      <div className="space-y-2">
        {value.map((p, i) => (
          <div key={i} className="border-l-2 border-slate-200 pl-2">
            <div className="flex gap-2">
              <label className="flex items-center gap-1">
                <span>name</span>
                <input
                  aria-label="Param name"
                  className="border rounded px-1"
                  value={p.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={p.required}
                  onChange={(e) => patch(i, { required: e.target.checked })}
                />
                required
              </label>
              <button
                className="text-red-600"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >remove</button>
            </div>
            <TypeBuilder value={p.type} onChange={(t) => patch(i, { type: t })} typeNames={typeNames} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

Add to `EndpointEditor.tsx` after the description block:
```tsx
<ParamTable title="Path params" value={endpoint.pathParams} onChange={(v) => patch({ pathParams: v })} typeNames={Object.keys(spec.types)} />
<ParamTable title="Query params" value={endpoint.queryParams} onChange={(v) => patch({ queryParams: v })} typeNames={Object.keys(spec.types)} />
<ParamTable title="Headers" value={endpoint.headers} onChange={(v) => patch({ headers: v })} typeNames={Object.keys(spec.types)} />
```

Run test: PASS.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/ui/ParamTable.tsx apps/web/src/ui/EndpointEditor.tsx apps/web/tests/ui/ParamTable.test.tsx
git commit -m "feat(endpoints): typed param tables for path/query/headers"
```

---

### Task 11: Request body + response types editor

**Files:**
- Modify: `apps/web/src/ui/EndpointEditor.tsx`
- Test: add to `apps/web/tests/ui/EndpointEditor.test.tsx`

**Acceptance criteria:** endpoint editor #3, #4.

- [ ] **Step 1: Test**

Append to existing test file:
```tsx
test('adds response type for status 200', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [{
        id: 'e1', method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
      }],
      types: { User: { kind: 'object', fields: [] } },
    },
    fileHandle: null, dirty: false,
    selectedEndpointId: 'e1',
  });
  render(<EndpointEditor />);
  await userEvent.click(screen.getByRole('button', { name: 'Add response' }));
  const status = screen.getByLabelText('Status') as HTMLInputElement;
  await userEvent.clear(status);
  await userEvent.type(status, '200');
  expect(useSpecStore.getState().spec.endpoints[0].responses).toHaveLength(1);
});
```

- [ ] **Step 2: Implement**

Add inside `EndpointEditor`:
```tsx
import { TypeBuilder } from './TypeBuilder';

// after param tables:
<section className="border rounded p-2">
  <h3 className="font-semibold text-sm">Request body (application/json)</h3>
  <label className="mb-2 block">
    <input
      type="checkbox"
      checked={!!endpoint.requestBody}
      onChange={(e) => patch({ requestBody: e.target.checked ? { kind: 'object', fields: [] } : null })}
    /> has body
  </label>
  {endpoint.requestBody && (
    <TypeBuilder value={endpoint.requestBody} onChange={(t) => patch({ requestBody: t })} typeNames={Object.keys(spec.types)} />
  )}
</section>

<section className="border rounded p-2">
  <div className="flex items-center justify-between mb-2">
    <h3 className="font-semibold text-sm">Responses</h3>
    <button
      className="rounded border px-2 py-0.5"
      onClick={() => patch({ responses: [...endpoint.responses, { status: 200, type: { kind: 'object', fields: [] } }] })}
    >Add response</button>
  </div>
  <div className="space-y-2">
    {endpoint.responses.map((r, i) => (
      <div key={i} className="border-l-2 border-slate-200 pl-2 space-y-1">
        <div className="flex gap-2">
          <label className="flex items-center gap-1">
            <span>Status</span>
            <input
              aria-label="Status"
              type="number"
              className="border rounded px-1 w-20"
              value={r.status}
              onChange={(e) => {
                const next = endpoint.responses.slice();
                next[i] = { ...next[i], status: Number(e.target.value) };
                patch({ responses: next });
              }}
            />
          </label>
          <button
            className="text-red-600"
            onClick={() => patch({ responses: endpoint.responses.filter((_, j) => j !== i) })}
          >remove</button>
        </div>
        <TypeBuilder
          value={r.type}
          onChange={(t) => {
            const next = endpoint.responses.slice();
            next[i] = { ...next[i], type: t };
            patch({ responses: next });
          }}
          typeNames={Object.keys(spec.types)}
        />
      </div>
    ))}
  </div>
</section>
```

Run tests: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/ui/EndpointEditor.tsx apps/web/tests/ui/EndpointEditor.test.tsx
git commit -m "feat(endpoints): request body and status-keyed response types"
```

---

### Task 12: Environments + auth preset editors

**Files:**
- Create: `apps/web/src/ui/EnvEditor.tsx`, `apps/web/src/ui/AuthEditor.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/tests/ui/EnvEditor.test.tsx`

**Acceptance criteria:** env/auth #1, #2, #3, #4, #5 (secrets UI); edge case "Opening a spec where secrets were stripped".

- [ ] **Step 1: Test**

`apps/web/tests/ui/EnvEditor.test.tsx`:
```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnvEditor } from '../../src/ui/EnvEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('add env and mark a var as secret', async () => {
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false });
  render(<EnvEditor />);
  await userEvent.click(screen.getByRole('button', { name: 'Add environment' }));
  expect(Object.keys(useSpecStore.getState().spec.environments)).toContain('env2');
  await userEvent.click(screen.getByRole('button', { name: 'Add variable' }));
  await userEvent.type(screen.getByLabelText('Variable name'), 'TOKEN');
  await userEvent.click(screen.getByLabelText('secret'));
  const envs = useSpecStore.getState().spec.environments;
  const active = envs[useSpecStore.getState().spec.activeEnvironment];
  expect(active.variables[0]).toMatchObject({ name: 'TOKEN', secret: true });
});
```

- [ ] **Step 2: Implement**

`apps/web/src/ui/EnvEditor.tsx`:
```tsx
import { useSpecStore } from '../state/store';

export function EnvEditor() {
  const { spec, setSpec } = useSpecStore();
  const activeName = spec.activeEnvironment;
  const env = spec.environments[activeName] ?? { variables: [] };

  const setEnvs = (envs: typeof spec.environments, active = activeName) =>
    void setSpec({ ...spec, environments: envs, activeEnvironment: active });

  const addEnv = () => {
    let i = 2;
    while (spec.environments[`env${i}`]) i++;
    setEnvs({ ...spec.environments, [`env${i}`]: { variables: [] } }, `env${i}`);
  };

  const setVar = (idx: number, patch: Partial<typeof env.variables[number]>) => {
    const next = env.variables.slice();
    next[idx] = { ...next[idx], ...patch };
    setEnvs({ ...spec.environments, [activeName]: { variables: next } });
  };

  return (
    <section className="border rounded p-2 space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <label>Active env
          <select
            aria-label="Active environment"
            className="ml-1 border rounded px-1"
            value={activeName}
            onChange={(e) => void setSpec({ ...spec, activeEnvironment: e.target.value })}
          >
            {Object.keys(spec.environments).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="rounded border px-2 py-0.5" onClick={addEnv}>Add environment</button>
      </div>
      <div>
        <button
          className="rounded border px-2 py-0.5"
          onClick={() => setEnvs({
            ...spec.environments,
            [activeName]: { variables: [...env.variables, { name: '', value: '', secret: false }] },
          })}
        >Add variable</button>
      </div>
      <div className="space-y-1">
        {env.variables.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label="Variable name"
              className="border rounded px-1"
              value={v.name}
              onChange={(e) => setVar(i, { name: e.target.value })}
            />
            <input
              aria-label={`value-${v.name || i}`}
              className="border rounded px-1 flex-1"
              type={v.secret ? 'password' : 'text'}
              value={v.value}
              onChange={(e) => setVar(i, { value: e.target.value })}
            />
            <label className="flex items-center gap-1">
              <input
                aria-label="secret"
                type="checkbox"
                checked={v.secret}
                onChange={(e) => setVar(i, { secret: e.target.checked })}
              />
              secret
            </label>
            <button
              className="text-red-600"
              onClick={() => setEnvs({
                ...spec.environments,
                [activeName]: { variables: env.variables.filter((_, j) => j !== i) },
              })}
            >remove</button>
          </div>
        ))}
      </div>
    </section>
  );
}
```

`apps/web/src/ui/AuthEditor.tsx`:
```tsx
import { useSpecStore } from '../state/store';
import type { AuthPreset } from '../schema/types';

export function AuthEditor({ value, onChange }: { value: AuthPreset; onChange(next: AuthPreset): void }) {
  return (
    <div className="border rounded p-2 text-sm space-y-2">
      <label>Auth
        <select
          aria-label="Auth type"
          className="ml-1 border rounded px-1"
          value={value.type}
          onChange={(e) => {
            const t = e.target.value as AuthPreset['type'];
            if (t === 'none') onChange({ type: 'none' });
            if (t === 'bearer') onChange({ type: 'bearer', token: '' });
            if (t === 'basic') onChange({ type: 'basic', username: '', password: '' });
            if (t === 'apiKey') onChange({ type: 'apiKey', in: 'header', name: '', value: '' });
          }}
        >
          <option value="none">None</option>
          <option value="bearer">Bearer</option>
          <option value="basic">Basic</option>
          <option value="apiKey">API Key</option>
        </select>
      </label>
      {value.type === 'bearer' && (
        <label>Token <input aria-label="Token" className="border rounded px-1 ml-1" value={value.token} onChange={(e) => onChange({ ...value, token: e.target.value })} /></label>
      )}
      {value.type === 'basic' && (
        <div className="flex gap-2">
          <label>User <input aria-label="Username" className="border rounded px-1 ml-1" value={value.username} onChange={(e) => onChange({ ...value, username: e.target.value })} /></label>
          <label>Pass <input aria-label="Password" type="password" className="border rounded px-1 ml-1" value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} /></label>
        </div>
      )}
      {value.type === 'apiKey' && (
        <div className="flex gap-2">
          <label>In
            <select aria-label="API key location" className="ml-1 border rounded px-1" value={value.in} onChange={(e) => onChange({ ...value, in: e.target.value as 'header' | 'query' })}>
              <option value="header">header</option>
              <option value="query">query</option>
            </select>
          </label>
          <label>Name <input aria-label="API key name" className="border rounded px-1 ml-1" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></label>
          <label>Value <input aria-label="API key value" className="border rounded px-1 ml-1" value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} /></label>
        </div>
      )}
    </div>
  );
}
```

Update `App.tsx` to add a right-side panel with env + spec-level auth:

```tsx
import { useEffect } from 'react';
import { AppHeader } from './ui/AppHeader';
import { TypePanel } from './ui/TypePanel';
import { EndpointList } from './ui/EndpointList';
import { EndpointEditor } from './ui/EndpointEditor';
import { EnvEditor } from './ui/EnvEditor';
import { AuthEditor } from './ui/AuthEditor';
import { useSpecStore } from './state/store';

export function App() {
  const { spec, setSpec, restoreDraft } = useSpecStore();
  useEffect(() => { void restoreDraft(); }, [restoreDraft]);
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="flex flex-1">
        <TypePanel />
        <EndpointList />
        <EndpointEditor />
        <aside className="w-80 border-l p-3 space-y-3">
          <h2 className="font-semibold text-sm">Environment</h2>
          <EnvEditor />
          <h2 className="font-semibold text-sm">Default auth</h2>
          <AuthEditor
            value={spec.auth}
            onChange={(auth) => void setSpec({ ...spec, auth })}
          />
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={spec.useProxyDefault}
              onChange={(e) => void setSpec({ ...spec, useProxyDefault: e.target.checked })}
            />
            use proxy by default
          </label>
        </aside>
      </div>
    </div>
  );
}
```

Add the per-endpoint auth override to `EndpointEditor.tsx` (insert before the request-body section):

```tsx
import { AuthEditor } from './AuthEditor';
// ...

<section className="border rounded p-2">
  <h3 className="font-semibold text-sm mb-1">Auth</h3>
  <label className="flex items-center gap-1">
    <input
      type="radio"
      name={`auth-${endpoint.id}`}
      checked={endpoint.auth === 'inherit'}
      onChange={() => patch({ auth: 'inherit' })}
    /> inherit from spec default
  </label>
  <label className="flex items-center gap-1">
    <input
      type="radio"
      name={`auth-${endpoint.id}`}
      checked={endpoint.auth !== 'inherit'}
      onChange={() => patch({ auth: { type: 'none' } })}
    /> override
  </label>
  {endpoint.auth !== 'inherit' && (
    <AuthEditor value={endpoint.auth} onChange={(a) => patch({ auth: a })} />
  )}
</section>
```

Run test: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/ui/EnvEditor.tsx apps/web/src/ui/AuthEditor.tsx apps/web/src/ui/EndpointEditor.tsx apps/web/src/App.tsx apps/web/tests/ui/EnvEditor.test.tsx
git commit -m "feat(env/auth): environment and auth preset editors"
```

---

### Task 13: Variable substitution

**Files:**
- Create: `apps/web/src/runner/substitute.ts`
- Test: `apps/web/tests/runner/substitute.test.ts`

**Acceptance criteria:** runner #2; edge case "Variable referenced but not defined".

- [ ] **Step 1: Tests**

`apps/web/tests/runner/substitute.test.ts`:
```ts
import { expect, test } from 'vitest';
import { substitute } from '../../src/runner/substitute';

test('substitutes known vars', () => {
  const { text, missing } = substitute('hi {{name}}!', { name: 'world' });
  expect(text).toBe('hi world!');
  expect(missing).toEqual([]);
});

test('leaves unknown vars and reports them', () => {
  const { text, missing } = substitute('{{a}}/{{b}}', { a: '1' });
  expect(text).toBe('1/{{b}}');
  expect(missing).toEqual(['b']);
});

test('handles whitespace in braces', () => {
  expect(substitute('{{ name }}', { name: 'x' }).text).toBe('x');
});
```

- [ ] **Step 2: Implement**

`apps/web/src/runner/substitute.ts`:
```ts
export function substitute(input: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = input.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, name) => {
    if (name in vars) return vars[name];
    if (!missing.includes(name)) missing.push(name);
    return m;
  });
  return { text, missing };
}
```

Run: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/runner apps/web/tests/runner
git commit -m "feat(runner): {{var}} substitution"
```

---

### Task 14: Request runner + response viewer with inline errors

**Files:**
- Create: `apps/web/src/runner/auth.ts`, `apps/web/src/runner/send.ts`, `apps/web/src/runner/classify-error.ts`
- Create: `apps/web/src/ui/RunPanel.tsx`, `apps/web/src/ui/ResponseView.tsx`
- Modify: `apps/web/src/ui/EndpointEditor.tsx`
- Test: `apps/web/tests/runner/send.test.ts`, `apps/web/tests/runner/auth.test.ts`, `apps/web/tests/runner/classify-error.test.ts`, `apps/web/tests/ui/ResponseView.test.tsx`

**Acceptance criteria:** runner #1, #3, #4, #5 (partial — direct fetch; proxy in Task 16), #6 (partial); edge cases "Network error / CORS failure", "Missing response type for a returned status".

- [ ] **Step 1: Auth tests and implementation**

`apps/web/tests/runner/auth.test.ts`:
```ts
import { expect, test } from 'vitest';
import { applyAuth } from '../../src/runner/auth';

test('bearer adds header', () => {
  const r = applyAuth({ headers: {}, url: new URL('http://x') }, { type: 'bearer', token: 't' });
  expect(r.headers['Authorization']).toBe('Bearer t');
});
test('basic base64 encodes', () => {
  const r = applyAuth({ headers: {}, url: new URL('http://x') }, { type: 'basic', username: 'u', password: 'p' });
  expect(r.headers['Authorization']).toBe('Basic ' + btoa('u:p'));
});
test('api key in header', () => {
  const r = applyAuth({ headers: {}, url: new URL('http://x') }, { type: 'apiKey', in: 'header', name: 'X-Key', value: 'v' });
  expect(r.headers['X-Key']).toBe('v');
});
test('api key in query', () => {
  const r = applyAuth({ headers: {}, url: new URL('http://x/?a=1') }, { type: 'apiKey', in: 'query', name: 'k', value: 'v' });
  expect(r.url.searchParams.get('k')).toBe('v');
});
```

`apps/web/src/runner/auth.ts`:
```ts
import { AuthPreset } from '../schema/types';

export interface AuthContext { headers: Record<string, string>; url: URL }

export function applyAuth(ctx: AuthContext, auth: AuthPreset): AuthContext {
  const next = { headers: { ...ctx.headers }, url: new URL(ctx.url) };
  switch (auth.type) {
    case 'none': return next;
    case 'bearer':
      next.headers['Authorization'] = `Bearer ${auth.token}`;
      return next;
    case 'basic':
      next.headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
      return next;
    case 'apiKey':
      if (auth.in === 'header') next.headers[auth.name] = auth.value;
      else next.url.searchParams.set(auth.name, auth.value);
      return next;
  }
}
```

- [ ] **Step 2: Error classification**

`apps/web/tests/runner/classify-error.test.ts`:
```ts
import { expect, test } from 'vitest';
import { classifyError } from '../../src/runner/classify-error';

test('TypeError → cors-or-network', () => {
  expect(classifyError(new TypeError('Failed to fetch'))).toMatchObject({ kind: 'cors-or-network' });
});
test('AbortError → timeout', () => {
  const e = new Error('timeout');
  e.name = 'AbortError';
  expect(classifyError(e)).toMatchObject({ kind: 'timeout' });
});
```

`apps/web/src/runner/classify-error.ts`:
```ts
export type ClassifiedError =
  | { kind: 'timeout'; hint: string }
  | { kind: 'cors-or-network'; hint: string }
  | { kind: 'other'; hint: string; message: string };

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof Error && err.name === 'AbortError') {
    return { kind: 'timeout', hint: 'Request took too long. Check the server or raise the timeout.' };
  }
  if (err instanceof TypeError) {
    return {
      kind: 'cors-or-network',
      hint: 'Failed to fetch — likely CORS, DNS, or the server is down. Enable CORS on the server or toggle "Use proxy" on this request.',
    };
  }
  return { kind: 'other', hint: 'Unexpected error', message: err instanceof Error ? err.message : String(err) };
}
```

- [ ] **Step 3: Send function**

`apps/web/tests/runner/send.test.ts`:
```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sendRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

const endpoint: Endpoint = {
  id: 'e1', method: 'GET', path: '/users/{id}',
  pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
  queryParams: [{ name: 'q', required: false, type: { kind: 'string' } }],
  headers: [], requestBody: null, responses: [{ status: 200, type: { kind: 'object', fields: [] } }],
  auth: 'inherit', useProxy: 'inherit',
};

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: string) => new Response(JSON.stringify({}), {
    status: 200, headers: { 'content-type': 'application/json' },
  })) as any;
});
afterEach(() => vi.restoreAllMocks());

test('substitutes path params and query, returns typed result', async () => {
  const spec = { ...emptySpec(), environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } }, activeEnvironment: 'default' };
  const res = await sendRequest({
    spec, endpoint, baseUrl: '{{base}}', inputs: { path: { id: '7' }, query: { q: 'hi' }, headers: {}, body: undefined },
    secrets: {},
  });
  expect((globalThis.fetch as any).mock.calls[0][0]).toBe('http://api/users/7?q=hi');
  expect(res.ok).toBe(true);
  expect(res.status).toBe(200);
});
```

`apps/web/src/runner/send.ts`:
```ts
import { Endpoint, Spec } from '../schema/types';
import { substitute } from './substitute';
import { applyAuth } from './auth';
import { classifyError, ClassifiedError } from './classify-error';

export interface RunInputs {
  path: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export interface RunRequest {
  spec: Spec;
  endpoint: Endpoint;
  baseUrl: string;
  inputs: RunInputs;
  secrets: Record<string, string>;
  useProxy?: boolean;
  proxyUrl?: string; // defaults to http://localhost:4801
}

export interface RunResult {
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawText?: string;
  latencyMs?: number;
  error?: ClassifiedError;
  missingVars: string[];
}

function envVars(req: RunRequest): Record<string, string> {
  const env = req.spec.environments[req.spec.activeEnvironment] ?? { variables: [] };
  const out: Record<string, string> = {};
  for (const v of env.variables) {
    if (v.secret) {
      const s = req.secrets[v.name];
      if (s !== undefined) out[v.name] = s;
    } else {
      out[v.name] = v.value;
    }
  }
  return out;
}

export async function sendRequest(req: RunRequest): Promise<RunResult> {
  const vars = envVars(req);
  const missing: string[] = [];
  const sub = (s: string) => {
    const { text, missing: m } = substitute(s, vars);
    for (const x of m) if (!missing.includes(x)) missing.push(x);
    return text;
  };

  let path = req.endpoint.path;
  for (const [k, v] of Object.entries(req.inputs.path)) path = path.replaceAll(`{${k}}`, encodeURIComponent(v));
  const url = new URL(sub(req.baseUrl + path));
  for (const [k, v] of Object.entries(req.inputs.query)) if (v !== '') url.searchParams.set(k, sub(v));

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.inputs.headers)) headers[k] = sub(v);
  if (req.endpoint.requestBody) headers['content-type'] = 'application/json';

  const auth = req.endpoint.auth === 'inherit' ? req.spec.auth : req.endpoint.auth;
  const ctx = applyAuth({ headers, url }, auth);

  let target = ctx.url.toString();
  const useProxy = req.useProxy ?? (req.endpoint.useProxy === 'inherit' ? req.spec.useProxyDefault : req.endpoint.useProxy);
  if (useProxy) {
    const proxy = req.proxyUrl ?? 'http://localhost:4801';
    target = `${proxy}/proxy?url=${encodeURIComponent(ctx.url.toString())}`;
  }

  const bodyText = req.endpoint.requestBody && req.inputs.body !== undefined
    ? sub(JSON.stringify(req.inputs.body))
    : undefined;

  const start = performance.now();
  try {
    const resp = await fetch(target, {
      method: req.endpoint.method,
      headers: ctx.headers,
      body: bodyText,
    });
    const rawText = await resp.text();
    const latencyMs = Math.round(performance.now() - start);
    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => { respHeaders[k] = v; });
    let body: unknown;
    try { body = JSON.parse(rawText); } catch { body = undefined; }
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
      body,
      rawText,
      latencyMs,
      missingVars: missing,
    };
  } catch (err) {
    return { ok: false, error: classifyError(err), latencyMs: Math.round(performance.now() - start), missingVars: missing };
  }
}
```

Run all runner tests: PASS.

- [ ] **Step 4: ResponseView with inline squiggly errors**

`apps/web/tests/ui/ResponseView.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { ResponseView } from '../../src/ui/ResponseView';

test('highlights path with error', () => {
  render(<ResponseView body={{ user: { age: 'x' } }} errors={[{ path: 'user.age', message: 'expected number, got string' }]} />);
  const marks = document.querySelectorAll('[data-error]');
  expect(marks.length).toBeGreaterThan(0);
});
```

`apps/web/src/ui/ResponseView.tsx`:
```tsx
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ValidationError } from '../validator/validate';

interface Props { body: unknown; errors: ValidationError[] }

export function ResponseView({ body, errors }: Props) {
  const byPath = new Map<string, string>();
  for (const e of errors) byPath.set(e.path, e.message);

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="font-mono text-xs whitespace-pre">
        {renderNode(body, '', byPath)}
      </div>
      {errors.length > 0 && (
        <ul role="list" className="mt-3 border-t pt-2 text-xs">
          {errors.map((e, i) => (
            <li key={i} className="text-red-700"><code>{e.path || '/'}</code>: {e.message}</li>
          ))}
        </ul>
      )}
    </Tooltip.Provider>
  );
}

function renderNode(v: unknown, path: string, errs: Map<string, string>, indent = 0): JSX.Element {
  const pad = '  '.repeat(indent);
  const key = path;
  const err = errs.get(key);

  const wrap = (el: JSX.Element) => err
    ? (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            data-error={key || '/'}
            className="underline decoration-red-500 decoration-wavy underline-offset-2"
          >{el}</span>
        </Tooltip.Trigger>
        <Tooltip.Content className="rounded bg-red-700 px-2 py-1 text-white">{err}</Tooltip.Content>
      </Tooltip.Root>
    )
    : el;

  if (v === null) return wrap(<span>null</span>);
  if (typeof v !== 'object') return wrap(<span>{JSON.stringify(v)}</span>);
  if (Array.isArray(v)) {
    return (
      <span>[{v.length === 0 ? ']' : '\n'}
        {v.map((item, i) => (
          <span key={i}>{pad}  {renderNode(item, `${path}[${i}]`, errs, indent + 1)}{i < v.length - 1 ? ',' : ''}{'\n'}</span>
        ))}
        {v.length > 0 && <span>{pad}]</span>}
      </span>
    );
  }
  const entries = Object.entries(v as Record<string, unknown>);
  return (
    <span>{'{'}{entries.length === 0 ? '}' : '\n'}
      {entries.map(([k, val], i) => {
        const childPath = path ? `${path}.${k}` : k;
        return (
          <span key={k}>{pad}  <span>{JSON.stringify(k)}</span>: {renderNode(val, childPath, errs, indent + 1)}{i < entries.length - 1 ? ',' : ''}{'\n'}</span>
        );
      })}
      {entries.length > 0 && <span>{pad}{'}'}</span>}
    </span>
  );
}
```

- [ ] **Step 5: RunPanel — inputs + Send + result**

`apps/web/src/ui/RunPanel.tsx`:
```tsx
import { useState } from 'react';
import { useSpecStore } from '../state/store';
import { sendRequest, type RunResult } from '../runner/send';
import { validate, type ValidationError } from '../validator/validate';
import { substitute } from '../runner/substitute';
import { loadSecrets } from '../storage/drafts';
import { ResponseView } from './ResponseView';

export function RunPanel() {
  const { spec, selectedEndpointId } = useSpecStore();
  const endpoint = spec.endpoints.find((e) => e.id === selectedEndpointId);
  const [baseUrl, setBaseUrl] = useState('{{base}}');
  const [pathVals, setPathVals] = useState<Record<string, string>>({});
  const [queryVals, setQueryVals] = useState<Record<string, string>>({});
  const [headerVals, setHeaderVals] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState<string>('{}');
  const [useProxy, setUseProxy] = useState<boolean | undefined>(undefined);
  const [result, setResult] = useState<{ res: RunResult; validationErrors: ValidationError[]; note?: string } | null>(null);

  if (!endpoint) return null;

  function collectMissingVars(): string[] {
    const env = spec.environments[spec.activeEnvironment];
    const known: Record<string, string> = {};
    if (env) for (const v of env.variables) if (!v.secret) known[v.name] = v.value;
    const inputs = [
      baseUrl, endpoint.path,
      ...Object.values(queryVals), ...Object.values(headerVals),
      endpoint.requestBody ? bodyText : '',
    ];
    const missing = new Set<string>();
    for (const s of inputs) for (const m of substitute(s, known).missing) missing.add(m);
    return [...missing];
  }

  async function onSend() {
    const missingVars = collectMissingVars();
    if (missingVars.length > 0) {
      const go = confirm(
        `Undefined variable(s): ${missingVars.join(', ')}\n\nSending anyway will leave literal '{{name}}' in the request. Continue?`,
      );
      if (!go) return;
    }

    const secretStore = await loadSecrets();
    const secrets = secretStore[spec.activeEnvironment] ?? {};
    let body: unknown = undefined;
    if (endpoint.requestBody) {
      try { body = JSON.parse(bodyText); }
      catch { return setResult({ res: { ok: false, missingVars: [], error: { kind: 'other', hint: 'Bad JSON', message: 'Request body is not valid JSON' } }, validationErrors: [] }); }
    }
    const res = await sendRequest({
      spec, endpoint, baseUrl,
      inputs: { path: pathVals, query: queryVals, headers: headerVals, body },
      secrets,
      useProxy,
    });
    let validationErrors: ValidationError[] = [];
    let note: string | undefined;
    if (res.status != null) {
      const match = endpoint.responses.find((r) => r.status === res.status);
      if (!match) note = `No response type declared for status ${res.status}.`;
      else if (res.body !== undefined) validationErrors = validate(spec, match.type, res.body);
    }
    setResult({ res, validationErrors, note });
  }

  return (
    <section className="border-t p-4 space-y-2 text-sm">
      <div className="flex gap-2">
        <label className="flex-1">Base URL
          <input
            aria-label="Base URL"
            className="ml-1 border rounded px-1 w-full"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          <input
            aria-label="Use proxy"
            type="checkbox"
            checked={useProxy ?? (endpoint.useProxy === 'inherit' ? spec.useProxyDefault : endpoint.useProxy)}
            onChange={(e) => setUseProxy(e.target.checked)}
          /> use proxy
        </label>
        <button className="rounded bg-slate-900 text-white px-3 py-1" onClick={() => void onSend()}>Send</button>
      </div>
      {endpoint.pathParams.length > 0 && (
        <ParamInputs label="Path" params={endpoint.pathParams} values={pathVals} onChange={setPathVals} />
      )}
      {endpoint.queryParams.length > 0 && (
        <ParamInputs label="Query" params={endpoint.queryParams} values={queryVals} onChange={setQueryVals} />
      )}
      {endpoint.headers.length > 0 && (
        <ParamInputs label="Headers" params={endpoint.headers} values={headerVals} onChange={setHeaderVals} />
      )}
      {endpoint.requestBody && (
        <label className="block">Body
          <textarea
            aria-label="Body"
            className="w-full border rounded px-1 font-mono"
            rows={5}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </label>
      )}
      {result && <RunResultView result={result} />}
    </section>
  );
}

function ParamInputs({ label, params, values, onChange }: {
  label: string; params: { name: string; required: boolean }[];
  values: Record<string, string>; onChange(v: Record<string, string>): void;
}) {
  return (
    <fieldset className="border rounded p-2">
      <legend>{label}</legend>
      {params.map((p) => (
        <label key={p.name} className="mr-2 inline-flex items-center gap-1">
          <span>{p.name}{p.required ? '*' : ''}</span>
          <input
            aria-label={`${label}:${p.name}`}
            className="border rounded px-1"
            value={values[p.name] ?? ''}
            onChange={(e) => onChange({ ...values, [p.name]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}

function RunResultView({ result }: { result: { res: RunResult; validationErrors: { path: string; message: string }[]; note?: string } }) {
  const { res, validationErrors, note } = result;
  if (res.error) {
    return (
      <div role="alert" className="rounded bg-red-50 p-2 text-red-700">
        <div className="font-semibold">{res.error.kind}</div>
        <div>{res.error.hint}</div>
        {res.error.kind === 'other' && 'message' in res.error && <div className="text-xs">{res.error.message}</div>}
      </div>
    );
  }
  if (res.missingVars.length > 0) {
    return <div role="alert" className="rounded bg-amber-50 p-2 text-amber-800">Undefined variables: {res.missingVars.join(', ')}. Define them or fix the reference, then resend.</div>;
  }
  const passed = validationErrors.length === 0 && !note;
  return (
    <div className={`rounded p-2 ${passed ? 'bg-green-50' : 'bg-amber-50'}`}>
      <div className="flex gap-4 text-xs">
        <span>Status: {res.status} {res.statusText}</span>
        <span>{res.latencyMs} ms</span>
        <span>{passed ? '✓ type ok' : validationErrors.length ? `✗ ${validationErrors.length} type errors` : 'no type declared'}</span>
      </div>
      {note && <div className="mt-1 text-xs text-amber-800">{note}</div>}
      {res.body !== undefined && (
        <ResponseView body={res.body} errors={validationErrors} />
      )}
    </div>
  );
}
```

Render `<RunPanel />` inside `EndpointEditor` after the responses section.

Run tests: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/runner apps/web/src/ui/RunPanel.tsx apps/web/src/ui/ResponseView.tsx apps/web/src/ui/EndpointEditor.tsx apps/web/tests/runner apps/web/tests/ui/ResponseView.test.tsx
git commit -m "feat(runner): direct-fetch request runner with inline type-error display"
```

---

### Task 15: Local CORS proxy CLI (`packages/proxy`)

**Files:**
- Create: `packages/proxy/package.json`, `packages/proxy/tsconfig.json`, `packages/proxy/src/server.ts`, `packages/proxy/src/cli.ts`, `packages/proxy/bin/gen-spec-proxy.js`
- Test: `packages/proxy/tests/server.test.ts`

**Acceptance criteria:** runner #5 (proxy routes through local proxy), #6 (unreachable proxy shows actionable error).

- [ ] **Step 1: Package skeleton**

`packages/proxy/package.json`:
```json
{
  "name": "gen-spec-proxy",
  "version": "0.1.0",
  "description": "CORS proxy for gen-spec",
  "type": "module",
  "bin": { "gen-spec-proxy": "bin/gen-spec-proxy.js" },
  "files": ["dist", "bin"],
  "scripts": {
    "build": "tsup src/cli.ts src/server.ts --format esm --dts --out-dir dist",
    "test": "vitest run",
    "dev": "tsx src/cli.ts"
  },
  "devDependencies": {
    "tsup": "^8.2.2",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3",
    "vitest": "^2.0.3"
  }
}
```

`packages/proxy/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "tests"] }
```

`packages/proxy/bin/gen-spec-proxy.js`:
```js
#!/usr/bin/env node
import('../dist/cli.js').then((m) => m.main(process.argv.slice(2)));
```

- [ ] **Step 2: Tests**

`packages/proxy/tests/server.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { createServer } from '../src/server';
import { once } from 'node:events';
import http from 'node:http';

async function startUpstream() {
  const u = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url, cookie: req.headers.cookie ?? null }));
  });
  u.listen(0);
  await once(u, 'listening');
  return u;
}

describe('proxy', () => {
  test('forwards request and includes Cookie header', async () => {
    const upstream = await startUpstream();
    const { port: upPort } = upstream.address() as { port: number };
    const server = createServer();
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as { port: number };

    const res = await fetch(`http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(`http://127.0.0.1:${upPort}/x`)}`, {
      headers: { cookie: 'a=1' },
    });
    const body = await res.json();
    expect(body.path).toBe('/x');
    expect(body.cookie).toBe('a=1');

    server.close(); upstream.close();
  });

  test('rejects missing url', async () => {
    const server = createServer();
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/proxy`);
    expect(res.status).toBe(400);
    server.close();
  });
});
```

- [ ] **Step 3: Implement server**

`packages/proxy/src/server.ts`:
```ts
import http, { IncomingMessage, ServerResponse } from 'node:http';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'upgrade', 'proxy-authorization']);

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/proxy') { res.statusCode = 404; res.end('Not found'); return; }
  const target = url.searchParams.get('url');
  if (!target) { res.statusCode = 400; res.end('Missing url query param'); return; }

  const outgoingHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v) continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === 'host') continue;
    outgoingHeaders[k] = Array.isArray(v) ? v.join(',') : v;
  }

  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: outgoingHeaders,
        body: body as any,
      });
      res.statusCode = upstream.status;
      upstream.headers.forEach((v, k) => {
        if (HOP_BY_HOP.has(k.toLowerCase())) return;
        res.setHeader(k, v);
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    } catch (err) {
      res.statusCode = 502;
      res.end(`proxy error: ${(err as Error).message}`);
    }
  });
}

export function createServer() {
  return http.createServer(handle);
}
```

`packages/proxy/src/cli.ts`:
```ts
import { createServer } from './server.js';

export function main(args: string[]) {
  const portArg = args.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.split('=')[1]) : 4801;
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`gen-spec-proxy listening on http://127.0.0.1:${port}`);
  });
}
```

Run: `pnpm --filter gen-spec-proxy test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/proxy
git commit -m "feat(proxy): local CORS proxy CLI with cookie passthrough"
```

---

### Task 16: Wire proxy into runner + actionable unreachable-proxy error

**Files:**
- Modify: `apps/web/src/runner/send.ts`, `apps/web/src/runner/classify-error.ts`, `apps/web/src/ui/RunPanel.tsx`
- Test: `apps/web/tests/runner/send.proxy.test.ts`

**Acceptance criteria:** runner #5 (complete), runner #6.

- [ ] **Step 1: Test**

`apps/web/tests/runner/send.proxy.test.ts`:
```ts
import { expect, test, vi, beforeEach } from 'vitest';
import { sendRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

const ep: Endpoint = {
  id: 'e', method: 'GET', path: '/a', pathParams: [], queryParams: [], headers: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: true,
};

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => { throw new TypeError('fetch failed'); }) as any;
});

test('unreachable proxy produces actionable hint (explicit override)', async () => {
  const spec = { ...emptySpec(), useProxyDefault: false };
  const res = await sendRequest({
    spec, endpoint: ep, baseUrl: 'http://api', inputs: { path: {}, query: {}, headers: {}, body: undefined },
    secrets: {}, useProxy: true,
  });
  expect(res.ok).toBe(false);
  expect(res.error?.hint).toMatch(/npx gen-spec-proxy/);
});

test('endpoint-level useProxy:true routes through proxy without explicit override', async () => {
  const spec = { ...emptySpec(), useProxyDefault: false };
  const res = await sendRequest({
    spec, endpoint: ep, baseUrl: 'http://api', inputs: { path: {}, query: {}, headers: {}, body: undefined },
    secrets: {},
    // no useProxy override — must honor endpoint.useProxy === true
  });
  expect(res.ok).toBe(false);
  expect(res.error?.hint).toMatch(/npx gen-spec-proxy/);
});
```

- [ ] **Step 2: Implement proxy-aware classification**

Note: the new `ctx` parameter on `classifyError` is defaulted to `{ useProxy: false }`, so Task 14's existing `classify-error.test.ts` — which calls `classifyError(err)` without a context — continues to pass unchanged.

Modify `classify-error.ts` to accept a context:
```ts
export function classifyError(err: unknown, ctx: { useProxy: boolean } = { useProxy: false }): ClassifiedError {
  if (err instanceof Error && err.name === 'AbortError') {
    return { kind: 'timeout', hint: 'Request took too long. Check the server or raise the timeout.' };
  }
  if (err instanceof TypeError) {
    if (ctx.useProxy) {
      return { kind: 'cors-or-network', hint: 'Proxy unreachable. Start it with: npx gen-spec-proxy' };
    }
    return {
      kind: 'cors-or-network',
      hint: 'Failed to fetch — likely CORS, DNS, or the server is down. Enable CORS on the server or toggle "Use proxy" on this request.',
    };
  }
  return { kind: 'other', hint: 'Unexpected error', message: err instanceof Error ? err.message : String(err) };
}
```

Modify `send.ts` catch block:
```ts
return { ok: false, error: classifyError(err, { useProxy: !!useProxy }), latencyMs: Math.round(performance.now() - start), missingVars: missing };
```

Run all tests: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/runner apps/web/tests/runner/send.proxy.test.ts
git commit -m "feat(runner): actionable error when proxy is unreachable"
```

---

### Task 17: Secret stripping on save + re-prompt on load

**Files:**
- Modify: `apps/web/src/schema/serialize.ts`, `apps/web/src/state/store.ts`, `apps/web/src/ui/EnvEditor.tsx`, `apps/web/src/ui/AppHeader.tsx`
- Test: `apps/web/tests/schema/secrets.test.ts`, `apps/web/tests/ui/EnvEditor.secrets.test.tsx`

**Acceptance criteria:** env/auth #5; edge case "Opening a spec where secrets were stripped".

- [ ] **Step 1: Tests**

`apps/web/tests/schema/secrets.test.ts`:
```ts
import { expect, test } from 'vitest';
import { stripSecrets, extractSecrets } from '../../src/schema/serialize';
import { emptySpec } from '../../src/schema/defaults';

test('stripSecrets clears secret values; extractSecrets returns them', () => {
  const s = emptySpec();
  s.environments.default.variables.push(
    { name: 'TOKEN', value: 'abc', secret: true },
    { name: 'BASE', value: 'http://x', secret: false },
  );
  const stripped = stripSecrets(s);
  expect(stripped.environments.default.variables[0].value).toBe('');
  expect(stripped.environments.default.variables[1].value).toBe('http://x');
  expect(extractSecrets(s)).toEqual({ default: { TOKEN: 'abc' } });
});
```

- [ ] **Step 2: Implement**

Append to `serialize.ts`:
```ts
import type { SecretStore } from '../storage/drafts';

export function stripSecrets(spec: Spec): Spec {
  const envs: typeof spec.environments = {};
  for (const [k, env] of Object.entries(spec.environments)) {
    envs[k] = { variables: env.variables.map((v) => v.secret ? { ...v, value: '' } : v) };
  }
  return { ...spec, environments: envs };
}

export function extractSecrets(spec: Spec): SecretStore {
  const out: SecretStore = {};
  for (const [name, env] of Object.entries(spec.environments)) {
    const bucket: Record<string, string> = {};
    for (const v of env.variables) if (v.secret && v.value) bucket[v.name] = v.value;
    if (Object.keys(bucket).length) out[name] = bucket;
  }
  return out;
}
```

Update `AppHeader.tsx` `saveSpec` with the full replaced function (add imports at the top; keep the broken-refs guard from Task 7):

```tsx
// apps/web/src/ui/AppHeader.tsx (imports — add these to the existing import list)
import { fromJSON, toJSON, stripSecrets, extractSecrets } from '../schema/serialize';
import { saveSecrets, loadSecrets } from '../storage/drafts';
import { collectBrokenRefs } from '../schema/rename';

// replace the entire saveSpec() function with:
async function saveSpec() {
  const broken = collectBrokenRefs(spec);
  if (broken.length > 0) {
    alert(`Cannot save: ${broken.length} broken type reference(s). Fix them in the Types panel.`);
    return;
  }
  const onDisk = stripSecrets(spec);
  const existing = await loadSecrets();
  await saveSecrets({ ...existing, ...extractSecrets(spec) });
  const text = toJSON(onDisk);
  if (fileHandle) {
    await writeFile(text, fileHandle);
    await markSaved(fileHandle);
    return;
  }
  if (supportsFileSystemAccess()) {
    const h = await pickSave();
    if (!h) return;
    await writeFile(text, h);
    await markSaved(h);
  } else {
    downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.gen-spec.json');
    await markSaved(null);
  }
}
```

**Load path — hydrate secrets from IndexedDB** so the EnvEditor's inputs show the previously-entered values (secrets are empty on disk). Replace the full `openSpec()` function:

```tsx
async function openSpec() {
  async function hydrateSecrets(parsed: Spec): Promise<Spec> {
    const store = await loadSecrets();
    const envs: typeof parsed.environments = {};
    for (const [name, env] of Object.entries(parsed.environments)) {
      const known = store[name] ?? {};
      envs[name] = {
        variables: env.variables.map((v) =>
          v.secret && !v.value && known[v.name] ? { ...v, value: known[v.name] } : v,
        ),
      };
    }
    return { ...parsed, environments: envs };
  }
  if (supportsFileSystemAccess()) {
    const h = await pickOpen();
    if (!h) return;
    const { text } = await readFile(h);
    await replaceSpec(await hydrateSecrets(fromJSON(JSON.parse(text))), h);
  } else {
    const up = await uploadFile();
    if (!up) return;
    await replaceSpec(await hydrateSecrets(fromJSON(JSON.parse(up.text))), null);
  }
}
```

(Add a `Spec` import at the top if it isn't already present: `import type { Spec } from '../schema/types';`.)

Add to `EnvEditor.tsx` an indicator inside each variable row, shown only when a secret has no value:
```tsx
{v.secret && !v.value && (
  <span role="alert" className="text-red-600 text-xs">missing secret</span>
)}
```

And in `RunPanel.tsx` `onSend`, **after** the missing-vars confirm dialog and **before** the `sendRequest` call, add the missing-secret guard:
```ts
const activeEnvVars = spec.environments[spec.activeEnvironment]?.variables ?? [];
const missingSecrets = activeEnvVars.filter((v) => v.secret && !v.value && !secrets[v.name]);
if (missingSecrets.length) {
  return setResult({ res: { ok: false, missingVars: [], error: { kind: 'other', hint: `Missing secrets: ${missingSecrets.map((s) => s.name).join(', ')}. Fill them in the Env panel before sending.`, message: '' } }, validationErrors: [] });
}
```

- [ ] **Step 3: Component test**

`apps/web/tests/ui/EnvEditor.secrets.test.tsx`:
```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { EnvEditor } from '../../src/ui/EnvEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('empty secret shows missing indicator', () => {
  const spec = emptySpec();
  spec.environments.default.variables.push({ name: 'TOKEN', value: '', secret: true });
  useSpecStore.setState({ spec, fileHandle: null, dirty: false });
  render(<EnvEditor />);
  expect(screen.getByText('missing secret')).toBeInTheDocument();
});
```

Run tests: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/schema apps/web/src/ui apps/web/tests/schema/secrets.test.ts apps/web/tests/ui/EnvEditor.secrets.test.tsx
git commit -m "feat(secrets): strip on save, mark missing on load, block send"
```

---

### Task 18: OpenAPI 3.1 exporter

**Files:**
- Create: `apps/web/src/exporters/openapi.ts`
- Test: `apps/web/tests/exporters/openapi.test.ts`

**Acceptance criteria:** export #1.

- [ ] **Step 1: Test**

`apps/web/tests/exporters/openapi.test.ts`:
```ts
import { expect, test } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec } from '../../src/schema/defaults';

test('emits basic OpenAPI doc', () => {
  const s = emptySpec('MyAPI');
  s.types.User = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  s.endpoints.push({
    id: 'e1', method: 'GET', path: '/users/{id}',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
    queryParams: [], headers: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const oas = toOpenApi(s);
  expect(oas.openapi).toBe('3.1.0');
  expect(oas.components.schemas.User).toBeDefined();
  expect(oas.paths['/users/{id}'].get.responses['200'].content['application/json'].schema.$ref)
    .toBe('#/components/schemas/User');
});
```

- [ ] **Step 2: Implement**

`apps/web/src/exporters/openapi.ts`:
```ts
import type { Spec, TypeDef } from '../schema/types';

export function toOpenApi(spec: Spec): any {
  const schemas: Record<string, any> = {};
  for (const [name, t] of Object.entries(spec.types)) schemas[name] = toSchema(t);

  const paths: Record<string, any> = {};
  for (const e of spec.endpoints) {
    const p = (paths[e.path] ??= {});
    p[e.method.toLowerCase()] = {
      summary: e.description,
      parameters: [
        ...e.pathParams.map((x) => param(x, 'path')),
        ...e.queryParams.map((x) => param(x, 'query')),
        ...e.headers.map((x) => param(x, 'header')),
      ],
      ...(e.requestBody ? {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: toSchema(e.requestBody) } },
        },
      } : {}),
      responses: Object.fromEntries(e.responses.map((r) => [
        String(r.status),
        { description: '', content: { 'application/json': { schema: toSchema(r.type) } } },
      ])),
    };
  }

  return {
    openapi: '3.1.0',
    info: { title: spec.info.name, version: spec.info.version ?? '0.1.0', description: spec.info.description },
    paths,
    components: { schemas },
  };
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
    case 'ref': return { $ref: `#/components/schemas/${t.ref}` };
  }
}
```

Run: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/exporters/openapi.ts apps/web/tests/exporters/openapi.test.ts
git commit -m "feat(export): OpenAPI 3.1 exporter"
```

---

### Task 19: JSON Schema + Markdown exporters

**Files:**
- Create: `apps/web/src/exporters/jsonschema.ts`, `apps/web/src/exporters/markdown.ts`
- Test: `apps/web/tests/exporters/jsonschema.test.ts`, `apps/web/tests/exporters/markdown.test.ts`

**Acceptance criteria:** export #2, export #3.

- [ ] **Step 1: JSON Schema test + impl**

`apps/web/tests/exporters/jsonschema.test.ts`:
```ts
import { expect, test } from 'vitest';
import { toJsonSchemaBundle } from '../../src/exporters/jsonschema';
import { emptySpec } from '../../src/schema/defaults';

test('bundles named types under $defs', () => {
  const s = emptySpec('X');
  s.types.User = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  const j = toJsonSchemaBundle(s);
  expect(j.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  expect(j.$defs.User).toBeDefined();
});
```

`apps/web/src/exporters/jsonschema.ts`:
```ts
import type { Spec, TypeDef } from '../schema/types';

export function toJsonSchemaBundle(spec: Spec): any {
  const $defs: Record<string, any> = {};
  for (const [name, t] of Object.entries(spec.types)) $defs[name] = toSchema(t);
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
    case 'ref': return { $ref: `#/$defs/${t.ref}` };
  }
}
```

- [ ] **Step 2: Markdown test + impl**

`apps/web/tests/exporters/markdown.test.ts`:
```ts
import { expect, test } from 'vitest';
import { toMarkdown } from '../../src/exporters/markdown';
import { emptySpec } from '../../src/schema/defaults';

test('renders a section per endpoint with tables', () => {
  const s = emptySpec('MyAPI');
  s.endpoints.push({
    id: 'e1', method: 'GET', path: '/u/{id}',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
    queryParams: [], headers: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] } }],
    auth: 'inherit', useProxy: 'inherit', description: 'Fetch user',
  });
  const md = toMarkdown(s);
  expect(md).toContain('# MyAPI');
  expect(md).toContain('## GET /u/{id}');
  expect(md).toContain('| id | string | yes |');
  expect(md).toContain('### Responses');
  expect(md).toContain('#### 200');
});
```

`apps/web/src/exporters/markdown.ts`:
```ts
import type { Spec, TypeDef, ParamDef } from '../schema/types';

export function toMarkdown(spec: Spec): string {
  const out: string[] = [];
  out.push(`# ${spec.info.name}`);
  if (spec.info.description) out.push(spec.info.description);
  if (Object.keys(spec.types).length) {
    out.push('\n## Types\n');
    for (const [name, t] of Object.entries(spec.types)) {
      out.push(`### ${name}\n`);
      out.push('```json');
      out.push(describe(t));
      out.push('```\n');
    }
  }
  for (const e of spec.endpoints) {
    out.push(`\n## ${e.method} ${e.path}\n`);
    if (e.description) out.push(`${e.description}\n`);
    if (e.pathParams.length) out.push(paramTable('Path params', e.pathParams));
    if (e.queryParams.length) out.push(paramTable('Query params', e.queryParams));
    if (e.headers.length) out.push(paramTable('Headers', e.headers));
    if (e.requestBody) {
      out.push('### Request body\n```json');
      out.push(describe(e.requestBody));
      out.push('```');
    }
    out.push('### Responses\n');
    for (const r of e.responses) {
      out.push(`#### ${r.status}\n`);
      out.push('```json');
      out.push(describe(r.type));
      out.push('```\n');
    }
  }
  return out.join('\n');
}

function paramTable(title: string, params: ParamDef[]): string {
  const lines = [`### ${title}\n`, '| name | type | required | description |', '| --- | --- | --- | --- |'];
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

function describe(t: TypeDef): string {
  return JSON.stringify(skeleton(t), null, 2);
}

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

Run tests: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/exporters apps/web/tests/exporters
git commit -m "feat(export): JSON Schema bundle and Markdown exporters"
```

---

### Task 20: Export bundle zip (canonical JSON always included)

**Files:**
- Create: `apps/web/src/exporters/bundle.ts`, `apps/web/src/ui/ExportMenu.tsx`
- Modify: `apps/web/src/ui/AppHeader.tsx`
- Test: `apps/web/tests/exporters/bundle.test.ts`

**Acceptance criteria:** export #4, export #5.

- [ ] **Step 1: Test**

`apps/web/tests/exporters/bundle.test.ts`:
```ts
import { expect, test } from 'vitest';
import JSZip from 'jszip';
import { buildExportBundle } from '../../src/exporters/bundle';
import { emptySpec } from '../../src/schema/defaults';

test('always includes canonical JSON', async () => {
  const blob = await buildExportBundle(emptySpec('My'), { openapi: 'json' });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('spec.gen-spec.json')).not.toBeNull();
  expect(zip.file('openapi.json')).not.toBeNull();
});

test('supports all formats', async () => {
  const blob = await buildExportBundle(emptySpec('My'), { openapi: 'yaml', jsonschema: true, markdown: true });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('spec.gen-spec.json')).not.toBeNull();
  expect(zip.file('openapi.yaml')).not.toBeNull();
  expect(zip.file('schemas.json')).not.toBeNull();
  expect(zip.file('api.md')).not.toBeNull();
});
```

- [ ] **Step 2: Implement**

`apps/web/src/exporters/bundle.ts`:
```ts
import JSZip from 'jszip';
import YAML from 'yaml';
import type { Spec } from '../schema/types';
import { toJSON } from '../schema/serialize';
import { toOpenApi } from './openapi';
import { toJsonSchemaBundle } from './jsonschema';
import { toMarkdown } from './markdown';

export interface BundleOptions {
  openapi?: 'json' | 'yaml';
  jsonschema?: boolean;
  markdown?: boolean;
}

export async function buildExportBundle(spec: Spec, opts: BundleOptions): Promise<Blob> {
  const zip = new JSZip();
  zip.file('spec.gen-spec.json', toJSON(spec));
  if (opts.openapi) {
    const oas = toOpenApi(spec);
    if (opts.openapi === 'json') zip.file('openapi.json', JSON.stringify(oas, null, 2));
    else zip.file('openapi.yaml', YAML.stringify(oas));
  }
  if (opts.jsonschema) zip.file('schemas.json', JSON.stringify(toJsonSchemaBundle(spec), null, 2));
  if (opts.markdown) zip.file('api.md', toMarkdown(spec));
  return zip.generateAsync({ type: 'blob' });
}
```

- [ ] **Step 3: UI**

`apps/web/src/ui/ExportMenu.tsx`:
```tsx
import { useState } from 'react';
import { useSpecStore } from '../state/store';
import { buildExportBundle } from '../exporters/bundle';
import { downloadBlob } from '../storage/file';

export function ExportMenu() {
  const { spec } = useSpecStore();
  const [opts, setOpts] = useState({ openapi: 'json' as 'json' | 'yaml' | 'off', jsonschema: true, markdown: true });
  async function run() {
    const blob = await buildExportBundle(spec, {
      openapi: opts.openapi === 'off' ? undefined : opts.openapi,
      jsonschema: opts.jsonschema,
      markdown: opts.markdown,
    });
    downloadBlob(blob, `${spec.info.name.replace(/\s+/g, '-')}.gen-spec.zip`);
  }
  return (
    <details className="relative">
      <summary className="rounded border px-2 py-1 cursor-pointer">Export</summary>
      <div className="absolute right-0 z-10 mt-1 space-y-1 rounded border bg-white p-2 shadow text-sm">
        <label>OpenAPI
          <select className="ml-1 border rounded px-1" value={opts.openapi} onChange={(e) => setOpts({ ...opts, openapi: e.target.value as any })}>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="off">off</option>
          </select>
        </label>
        <label className="block"><input type="checkbox" checked={opts.jsonschema} onChange={(e) => setOpts({ ...opts, jsonschema: e.target.checked })} /> JSON Schema</label>
        <label className="block"><input type="checkbox" checked={opts.markdown} onChange={(e) => setOpts({ ...opts, markdown: e.target.checked })} /> Markdown</label>
        <div className="text-xs text-slate-500">Canonical JSON is always included.</div>
        <button className="rounded bg-slate-900 text-white px-2 py-1 mt-1" onClick={() => void run()}>Download bundle</button>
      </div>
    </details>
  );
}
```

Add `<ExportMenu />` to `AppHeader.tsx` next to Save.

Run tests: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/exporters/bundle.ts apps/web/src/ui/ExportMenu.tsx apps/web/src/ui/AppHeader.tsx apps/web/tests/exporters/bundle.test.ts
git commit -m "feat(export): zip bundle always including canonical JSON"
```

---

### Task 21: Playwright E2E smoke test + README

**Files:**
- Create: `apps/web/e2e/smoke.spec.ts`, `apps/web/playwright.config.ts`
- Modify: `apps/web/package.json` (add Playwright dep + script)
- Create: `README.md` at repo root

**Acceptance criteria:** end-to-end validation of the critical path (open/edit/save; send request; export).

- [ ] **Step 1: Add Playwright**

`apps/web/package.json` add:
```json
"scripts": { ..., "e2e": "playwright test" },
"devDependencies": { ..., "@playwright/test": "^1.45.0" }
```

`apps/web/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  webServer: { command: 'pnpm dev', port: 5173, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173' },
});
```

- [ ] **Step 2: Smoke test**

`apps/web/e2e/smoke.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('create type, endpoint, send against mock', async ({ page }) => {
  await page.route('https://mock.test/users/1', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', age: 'x' }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'New endpoint' }).click();
  await page.getByLabel('Path').fill('/users/{id}');
  await page.getByLabel('Method').selectOption('GET');
  await page.getByRole('button', { name: 'Add response' }).click();
  // declare 200 returns { id: string, age: number }
  await page.getByLabel('Status').fill('200');
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field name').first().fill('id');
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field name').nth(1).fill('age');
  const kindSelects = page.getByLabel('Kind');
  await kindSelects.nth(1).selectOption('number');
  await page.getByLabel('Base URL').fill('https://mock.test');
  await page.getByLabel('Path:id').fill('1');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/type errors/)).toBeVisible();
  await expect(page.getByText(/expected number, got string/)).toBeVisible();
});
```

- [ ] **Step 3: README**

`README.md`:
```markdown
# gen-spec

Typed API spec builder + runtime tester. Combines Postman (request testing), Swagger (API docs), and Zod (runtime type validation) into one browser app.

## Dev
```
pnpm install
pnpm dev
```

## Build
```
pnpm build
```

## Proxy
```
npx gen-spec-proxy
```
```

- [ ] **Step 4: Run everything**

Commands:
- `pnpm install`
- `pnpm -r test` → all passes
- `pnpm --filter web e2e` → passes
- `pnpm build` → succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e apps/web/package.json README.md
git commit -m "test(e2e): playwright smoke covering create→send→validate"
```

---

## Verification

- [ ] `pnpm install` succeeds at workspace root
- [ ] `pnpm -r lint` passes (tsc --noEmit in each package)
- [ ] `pnpm -r test` passes (Vitest on web + proxy)
- [ ] `pnpm --filter web e2e` passes (Playwright smoke)
- [ ] `pnpm build` produces `apps/web/dist/` and `packages/proxy/dist/`
- [ ] Manual check: open the built app, click through: `New` → add type → add endpoint with typed response → `Send` against a local API → see inline type errors on mismatched fields → `Export` produces a zip whose `spec.gen-spec.json` opens back in the app identically.
- [ ] All acceptance criteria from the spec have at least one covering task (mapped in each task's "Acceptance criteria" line).

## Acceptance Criteria Coverage Map

| Criterion | Covered by Task |
|---|---|
| Type builder UI, all kinds | Task 6 |
| String/number/integer/array constraints | Task 6 |
| Required/optional + description | Task 6, 10 |
| Named types panel + refs | Task 7 |
| Rename propagation | Task 7 |
| Endpoint method/path/description | Task 9 |
| Typed path/query/header params | Task 10 |
| Request body type | Task 11 |
| Multiple response types per status | Task 11 |
| Send + status/latency/headers/body display | Task 14 |
| {{var}} substitution | Task 13, 14 |
| Inline squiggly type errors | Task 14 |
| Proxy default + per-request toggle | Task 14, 16 |
| Proxy-unreachable error with `npx gen-spec-proxy` hint | Task 16 |
| Multi-environment + switcher | Task 12 |
| Auth presets (None/Bearer/Basic/API Key) | Task 12 |
| Auth spec-level + endpoint override | Task 12 |
| Secrets referenced via {{var}}, never written to file | Task 17 |
| Open / save file (FSA + fallback) | Task 4, 5 |
| IndexedDB draft across reload | Task 3, 5 |
| Discard draft reloads from source file | Task 5 (`discardDraft` + AppHeader "Discard draft" button) |
| Broken type ref blocks Save | Task 7 (saveSpec gate), Task 17 (full saveSpec with guard) |
| Undefined variable confirm-before-send | Task 14 (RunPanel `collectMissingVars` + confirm) |
| Plain JSON with stable shape | Task 2 |
| OpenAPI 3.1 export | Task 18 |
| JSON Schema bundle export | Task 19 |
| Markdown docs export | Task 19 |
| Export always bundles canonical JSON | Task 20 |
| Zip bundle for export | Task 20 |
| Missing response type warning | Task 14 |
| Undefined variable warning | Task 13, 14 |
| Broken ref detection | Task 7 |
| Circular type refs | Task 8 |
| Unknown-field tolerance / strict toggle | Task 8 (validator), Task 6 (strict UI) |
| Network/CORS classification | Task 14, 16 |
| Newer-version refusal | Task 2 |
| Missing secrets on load | Task 17 |
| FSA fallback | Task 4, 5 |

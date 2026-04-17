# Spec info + Base URL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the base URL from `RunPanel` component state to a first-class `Spec.info.baseUrl` field. Wire it into the editor, runner default, OpenAPI `servers`, and the Markdown header. Per-request overrides in `RunPanel` remain.

**Spec:** `docs/specs/active/2026-04-18-spec-info-base-url.md`

**Architecture:** Additive optional field on `Spec.info`. No schema version bump — old specs load as `baseUrl: undefined`, new specs drop the key when empty. Four touch-points: type definition, `SpecInfoEditor`, `RunPanel` (initialize + sync), exporters. No changes to `sendRequest` (it already takes `baseUrl` as a parameter).

**Tech Stack:** existing only.

---

## Rules Applied
`docs/rules/spec-versioning.md` — adding an optional field to `info` does **not** require a bump. Old readers ignore the unknown key; old specs load with `baseUrl: undefined`. Writers only emit the field when set (`JSON.stringify` drops `undefined`). This plan reaffirms that rule rather than changing it.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/schema/types.ts` | Add `baseUrl?: string` to `Spec.info` |
| Modify | `apps/web/src/ui/SpecInfoEditor.tsx` | Base URL input |
| Modify | `apps/web/src/ui/RunPanel.tsx` | Initialize + sync local `baseUrl` from spec |
| Modify | `apps/web/src/exporters/openapi.ts` | Emit `servers: [{ url }]` when set |
| Modify | `apps/web/src/exporters/markdown.ts` | Emit `**Base URL:**` header line when set |
| Modify | `apps/web/tests/schema/serialize.test.ts` | Round-trip coverage |
| Modify | `apps/web/tests/exporters/openapi.test.ts` | Servers emission coverage |
| Modify | `apps/web/tests/exporters/markdown.test.ts` | Base URL line coverage |
| Create | `apps/web/tests/ui/SpecInfoEditor.test.tsx` | Editor patches `info.baseUrl` / clears to `undefined` |
| Create-or-extend | `apps/web/tests/ui/RunPanel.test.tsx` | RunPanel initializes from spec + override doesn't mutate |

---

## Tasks

### Task 1: Schema field

**Files:**
- Modify: `apps/web/src/schema/types.ts`
- Modify: `apps/web/tests/schema/serialize.test.ts`

**Acceptance criteria covered:** requirement 1.

- [ ] **Step 1: Extend the `info` shape**

```ts
info: { name: string; version?: string; description?: string; baseUrl?: string };
```

Nothing else in `types.ts` changes — no new top-level field, no new `KEY_ORDER` entry (baseUrl lives inside `info`, which is already serialized as an object).

- [ ] **Step 2: Serialize round-trip tests**

Add two cases to `apps/web/tests/schema/serialize.test.ts`:

```ts
it('round-trips info.baseUrl', () => {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  const parsed = fromJSON(JSON.parse(toJSON(s)));
  expect(parsed.info.baseUrl).toBe('https://api.example.com');
});

it('omits info.baseUrl key when undefined', () => {
  const s = emptySpec();
  const text = toJSON(s);
  expect(text).not.toContain('"baseUrl"');
});
```

- [ ] **Step 3: Verify `pnpm --filter web test -- schema` is green.**

---

### Task 2: Editor input

**Files:**
- Modify: `apps/web/src/ui/SpecInfoEditor.tsx`
- Create: `apps/web/tests/ui/SpecInfoEditor.test.tsx`

**Acceptance criteria covered:** requirement 2.

- [ ] **Step 1: Add the Base URL input**

Insert **between** the name `<label>` and the version `<label>` in `SpecInfoEditor.tsx`:

```tsx
<label className="block">
  <span className="text-xs text-slate-500">{t('baseUrl')}</span>
  <input
    aria-label={t('baseUrl')}
    className="input mt-1 font-mono text-xs"
    value={info.baseUrl ?? ''}
    placeholder="https://api.example.com"
    onChange={(e) => patch({ baseUrl: e.target.value || undefined })}
  />
</label>
```

No new i18n keys needed — `baseUrl` is already in both `en.json` and `zh-TW.json`.

- [ ] **Step 2: Component test**

`apps/web/tests/ui/SpecInfoEditor.test.tsx`:

```ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { SpecInfoEditor } from '../../src/ui/SpecInfoEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

describe('SpecInfoEditor — baseUrl', () => {
  beforeEach(async () => {
    await useSpecStore.getState().replaceSpec(emptySpec(), null);
  });

  it('stores a typed URL as info.baseUrl', async () => {
    render(<SpecInfoEditor />);
    const input = screen.getByLabelText('Base URL');
    await userEvent.type(input, 'https://api.example.com');
    expect(useSpecStore.getState().spec.info.baseUrl).toBe('https://api.example.com');
  });

  it('clears the key back to undefined on empty input', async () => {
    const s = emptySpec();
    s.info.baseUrl = 'https://api.example.com';
    await useSpecStore.getState().replaceSpec(s, null);

    render(<SpecInfoEditor />);
    const input = screen.getByLabelText('Base URL');
    await userEvent.clear(input);

    expect(useSpecStore.getState().spec.info.baseUrl).toBeUndefined();
  });
});
```

`replaceSpec` is already exposed by the store and is the cleanest way to seed state without going through `setSpec` (which would mark dirty).

- [ ] **Step 3: Run `pnpm --filter web test -- SpecInfoEditor`** — expect green.

---

### Task 3: RunPanel initializes from spec

**Files:**
- Modify: `apps/web/src/ui/RunPanel.tsx`
- Create: `apps/web/tests/ui/RunPanel.test.tsx`

**Acceptance criteria covered:** requirement 3.

- [ ] **Step 1: Replace default state + add sync effect**

In `RunPanel.tsx`:

```ts
import { useEffect, useState } from 'react';
// ...existing imports

const [baseUrl, setBaseUrl] = useState(spec.info.baseUrl ?? '');

useEffect(() => {
  setBaseUrl(spec.info.baseUrl ?? '');
}, [spec.info.baseUrl]);
```

Drop the literal `'{{base}}'` default. The effect updates the local input when the underlying spec changes (new spec opened, or user edited the Base URL in `SpecInfoEditor`). Local edits after that are per-session overrides and do not mutate the spec.

Everything else in `RunPanel` stays. `sendRequest({ ... baseUrl, ... })` already flows the local value to the runner.

- [ ] **Step 2: Component test**

`apps/web/tests/ui/RunPanel.test.tsx` — new file. Seed the store with an endpoint so `RunPanel` renders.

Key cases:

```ts
it('initializes the Base URL input from spec.info.baseUrl', async () => {
  const s = specWithEndpoint();
  s.info.baseUrl = 'https://api.example.com';
  await useSpecStore.getState().replaceSpec(s, null);
  useSpecStore.getState().selectEndpoint(s.endpoints[0].id);

  render(<RunPanel />);
  const input = screen.getByLabelText('Base URL');
  expect(input).toHaveValue('https://api.example.com');
});

it('resyncs the Base URL input when spec.info.baseUrl changes', async () => {
  const s = specWithEndpoint();
  await useSpecStore.getState().replaceSpec(s, null);
  useSpecStore.getState().selectEndpoint(s.endpoints[0].id);

  const { rerender } = render(<RunPanel />);
  expect(screen.getByLabelText('Base URL')).toHaveValue('');

  await useSpecStore.getState().setSpec({
    ...useSpecStore.getState().spec,
    info: { ...useSpecStore.getState().spec.info, baseUrl: 'https://new.example' },
  });
  rerender(<RunPanel />);
  expect(screen.getByLabelText('Base URL')).toHaveValue('https://new.example');
});

it('editing the input does not mutate the spec', async () => {
  const s = specWithEndpoint();
  s.info.baseUrl = 'https://api.example.com';
  await useSpecStore.getState().replaceSpec(s, null);
  useSpecStore.getState().selectEndpoint(s.endpoints[0].id);

  render(<RunPanel />);
  const input = screen.getByLabelText('Base URL');
  await userEvent.clear(input);
  await userEvent.type(input, 'https://override.example');

  expect(useSpecStore.getState().spec.info.baseUrl).toBe('https://api.example.com');
});
```

`specWithEndpoint()` is a small helper inside the test file that calls `emptySpec()` then appends one endpoint — the existing `EndpointEditor.test.tsx` has a similar pattern; reuse the style.

- [ ] **Step 3: Run `pnpm --filter web test -- RunPanel`** — expect green.

---

### Task 4: OpenAPI exporter — servers

**Files:**
- Modify: `apps/web/src/exporters/openapi.ts`
- Modify: `apps/web/tests/exporters/openapi.test.ts`

**Acceptance criteria covered:** requirement 4.

- [ ] **Step 1: Emit `servers` conditionally**

In `toOpenApi`:

```ts
const doc: any = {
  openapi: '3.1.0',
  info: { title: spec.info.name, version: spec.info.version ?? '0.1.0', description: spec.info.description },
  paths,
  components: { schemas },
};
if (spec.info.baseUrl) doc.servers = [{ url: spec.info.baseUrl }];
return doc;
```

Keep the key ordering natural; OpenAPI consumers don't care, but tests should assert `servers` presence/absence, not position.

- [ ] **Step 2: Tests**

Add to `apps/web/tests/exporters/openapi.test.ts`:

```ts
it('emits servers[] when info.baseUrl is set', () => {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  const out = toOpenApi(s);
  expect(out.servers).toEqual([{ url: 'https://api.example.com' }]);
});

it('omits servers when info.baseUrl is absent', () => {
  const out = toOpenApi(emptySpec());
  expect('servers' in out).toBe(false);
});
```

- [ ] **Step 3: Run `pnpm --filter web test -- openapi`** — expect green.

---

### Task 5: Markdown exporter — base URL line

**Files:**
- Modify: `apps/web/src/exporters/markdown.ts`
- Modify: `apps/web/tests/exporters/markdown.test.ts`

**Acceptance criteria covered:** requirement 5.

- [ ] **Step 1: Emit the line**

In `toMarkdown`, after the description push and before the Types block:

```ts
if (spec.info.description) out.push(spec.info.description);
if (spec.info.baseUrl) out.push(`**Base URL:** \`${spec.info.baseUrl}\`\n`);
```

Backtick-wrap the URL so it renders as inline code in rendered Markdown — readable and copy-friendly.

- [ ] **Step 2: Tests**

Add:

```ts
it('includes a Base URL line when info.baseUrl is set', () => {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  expect(toMarkdown(s)).toContain('**Base URL:** `https://api.example.com`');
});

it('omits the Base URL line when absent', () => {
  expect(toMarkdown(emptySpec())).not.toContain('**Base URL:**');
});
```

- [ ] **Step 3: Run `pnpm --filter web test -- markdown`** — expect green.

---

### Task 6: Full-suite verification + UX pass + docs move

**Files:** none.

- [ ] **Step 1: Run the web suite**

`pnpm --filter web test`. No existing test should regress. The OpenAPI / Markdown / serialize tests may need their shared fixtures (`emptySpec()`) to remain empty on `baseUrl`; confirm.

- [ ] **Step 2: Run Playwright smoke**

`pnpm --filter web test:e2e` (check `apps/web/package.json` for the actual script name). No change expected — the smoke uses a test server URL already.

- [ ] **Step 3: Manual UX pass**

Start `pnpm dev`, then:
1. Open the Settings → API Info card. Enter `https://httpbin.org` as Base URL. Confirm the value persists across page reload (IndexedDB draft).
2. Create an endpoint `GET /get`. Open the Try-it panel. Confirm the Base URL input is pre-filled with `https://httpbin.org`.
3. Clear the Base URL in the Try-it input and type `https://httpbin.org` manually. Send. Confirm the request succeeds. Re-open the API Info card — the spec-level Base URL is unchanged (override did not persist).
4. Clear the Base URL in the API Info card. Confirm the Try-it input empties.
5. Export OpenAPI. Open the downloaded file. Confirm `servers: [{ url: "https://httpbin.org" }]` is present after setting Base URL, and absent after clearing it.
6. Export Markdown. Confirm the `**Base URL:**` line appears or doesn't match the above.

- [ ] **Step 4: Move docs**

On merge:
- Move `docs/specs/active/2026-04-18-spec-info-base-url.md` → `docs/specs/done/`.
- Move `docs/plans/active/2026-04-18-spec-info-base-url.md` → `docs/plans/done/`.
- Commit: `feat(spec): first-class baseUrl — editor + runner default + OpenAPI servers + Markdown header`.

---

## Open Questions
None at plan time.

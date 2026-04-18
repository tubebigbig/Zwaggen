# Response → request chaining — Implementation Plan

**Spec:** `docs/specs/active/2026-04-18-response-chaining.md`

**Goal:** Declarative captures from response body to env vars. Dot-path extractor + tiny runner. Editor + result UI. No scripting surface.

---

## Tasks

### Task 1: Schema + path evaluator

**Files:**
- Modify: `apps/web/src/schema/types.ts`
- Create: `apps/web/src/runner/path.ts`
- Create: `apps/web/tests/runner/path.test.ts`
- Modify: `apps/web/tests/schema/serialize.test.ts`

- [ ] Add `Capture` interface + `Endpoint.captures?: Capture[]` to types.
- [ ] Implement `parsePath(p)` + `extractByPath(body, path)` in `runner/path.ts`.
  - Parser handles `a`, `a.b`, `a[0]`, `[0]`, `a[0].b`, `users[0].nested.field`.
  - Malformed paths return `null` from `parsePath`; `extractByPath` returns `{ found: false }`.
  - Document `undefined` leaf semantic (use `in` operator OR `typeof cur[key] !== 'undefined'` — pick one, document).
- [ ] Tests cover all 10 cases from spec.
- [ ] Serialize round-trip: `endpoint.captures` persists; absent when undefined.
- [ ] Commit: `feat(runner): dot-path extractor + Endpoint.captures schema`.

### Task 2: Capture runner

**Files:**
- Create: `apps/web/src/runner/captures.ts`
- Create: `apps/web/tests/runner/captures.test.ts`

- [ ] `applyCaptures(spec, captures, body): { results, specPatch, secretsPatch }`.
- [ ] Stringify helper: null→`"null"`, string pass-through, number/bool `String(...)`, object/array `JSON.stringify`.
- [ ] Env var resolution: use `capture.envName ?? spec.activeEnvironment`.
- [ ] Non-secret hit → `specPatch` with updated value.
- [ ] Secret hit → entry in `secretsPatch`.
- [ ] Missing env var / missing env / missing path → warning result, no patch.
- [ ] Tests cover all 7 cases from spec.
- [ ] Commit: `feat(runner): applyCaptures writes env vars from response body`.

### Task 3: Editor + RunPanel integration

**Files:**
- Modify: `apps/web/src/ui/EndpointEditor.tsx`
- Modify: `apps/web/src/ui/RunPanel.tsx`
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json`
- Create: `apps/web/tests/ui/EndpointEditor.captures.test.tsx`
- Create: `apps/web/tests/ui/RunPanel.captures.test.tsx`

- [ ] Captures card in EndpointEditor: rows (path / setVar / envName dropdown / X). `addCapture` / `removeCapture` / `updateCapture` helpers. `patchCaptures` drops the key when empty (mirror `patchAssertions`).
- [ ] i18n keys (both locales):
  - en: `"captures": "Captures"`, `"capturesHint": "After a 2xx response, extract a value and save it to an env variable."`, `"addCapture": "Add capture"`, `"activeEnv": "Active environment"`
  - zh-TW: `"captures": "擷取"`, `"capturesHint": "當回應為 2xx 時，取值並寫入環境變數。"`, `"addCapture": "新增擷取"`, `"activeEnv": "目前環境"`
- [ ] RunPanel `onSend`: after the happy-path `setResult(...)`, if `res.ok`, call `applyCaptures(...)`, apply `specPatch` via `setSpec`, merge `secretsPatch` into IDB, and set `captureResults` on the result state.
- [ ] Extend result state type with `captureResults: CaptureResult[]`.
- [ ] Render captures section in `RunResultView` per spec.
- [ ] Tests:
  - Editor: add/remove/clear-drops-key.
  - RunPanel: non-secret capture writes to `spec.environments[env].variables[i].value`; secret capture writes to IDB and leaves spec value empty; missing env var shows warning row.
- [ ] Commit: `feat(web): capture editor + RunPanel applies captures on Send`.

### Task 4: e2e + docs move

- [ ] `pnpm e2e` green.
- [ ] Move spec + plan to `done/`. Commit.

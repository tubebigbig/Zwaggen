# Plan — Cover I/O errors in `AppHeader.openSpec`

Spec: `docs/specs/active/2026-04-21-open-spec-io-errors.md`.

Execute on branch `plan/open-spec-io-errors` in `.worktrees/open-spec-io-errors`. **All git ops inside the worktree.** Two commits (fix + tests) plus one archive commit.

## Tasks

### 1. Widen `openSpec`'s try/catch to cover the full open flow

**File:** `apps/web/src/ui/AppHeader.tsx`.

Current shape (lines ~73–118):

```tsx
async function openSpec() {
  async function hydrateSecrets(parsed: Spec): Promise<Spec> { /* ... */ }

  let filename: string;
  let text: string;
  let handle: FileHandle | null;

  if (supportsFileSystemAccess()) {
    const h = await pickOpen();
    if (!h) return;
    const r = await readFile(h);
    filename = r.name;
    text = r.text;
    handle = h;
  } else {
    const up = await uploadFile();
    if (!up) return;
    filename = up.name;
    text = up.text;
    handle = null;
  }

  let parsed: Spec;
  try {
    parsed = fromJSON(JSON.parse(text));
  } catch (err) {
    setLoadError({
      filename,
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  await replaceSpec(await hydrateSecrets(parsed), handle);
}
```

Rewrite to:

```tsx
async function openSpec() {
  async function hydrateSecrets(parsed: Spec): Promise<Spec> { /* unchanged */ }

  let filename = '';
  try {
    let text: string;
    let handle: FileHandle | null;

    if (supportsFileSystemAccess()) {
      const h = await pickOpen();
      if (!h) return;
      const r = await readFile(h);
      filename = r.name;
      text = r.text;
      handle = h;
    } else {
      const up = await uploadFile();
      if (!up) return;
      filename = up.name;
      text = up.text;
      handle = null;
    }

    const parsed = fromJSON(JSON.parse(text));
    await replaceSpec(await hydrateSecrets(parsed), handle);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    setLoadError({
      filename: filename || '—',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
```

Key properties — verify each after editing:
- The `if (!h) return;` / `if (!up) return;` early returns stay inside the try block (they return *through* the try cleanly — no catch fires because no throw).
- `filename` is declared outside the try so the catch can still read it when the throw came from `readFile` (already captured) vs `pickOpen` (still empty string).
- The former inner try/catch around `fromJSON(...)` is removed; its work is now covered by the outer catch.
- `hydrateSecrets` closure stays nested exactly where it is — do not extract it.

Run `pnpm --filter web exec tsc -b` after editing.

Commit:

```
fix(web): cover I/O errors in openSpec, swallow picker cancellation

Widen the try/catch around openSpec to cover pickOpen/readFile/
uploadFile, hydrateSecrets, and replaceSpec — any throw between
"user clicked Open" and "spec applied" now surfaces through the
LoadErrorModal instead of an unhandled promise rejection. AbortError
(user cancelled the native picker) early-returns silently, matching
the fallback <input> path's behaviour. Filename in the modal falls
back to em-dash when the throw happened before it was captured.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 2. Regression tests

**File:** `apps/web/tests/ui/AppHeader.loadError.test.tsx` — append two new tests. Keep the existing three tests untouched.

```tsx
it('silently no-ops when the user cancels the native picker (AbortError)', async () => {
  const before = useSpecStore.getState().spec;
  // supportsFileSystemAccess is mocked to false in this file; temporarily flip
  // it to exercise the pickOpen branch where AbortError originates.
  vi.mocked(fileModule.supportsFileSystemAccess).mockReturnValueOnce(true);
  vi.mocked(fileModule.pickOpen).mockRejectedValueOnce(
    Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }),
  );
  render(<AppHeader />);
  await clickOpen();
  // No modal, no store mutation.
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(useSpecStore.getState().spec).toEqual(before);
});

it('surfaces a modal when readFile rejects mid-open', async () => {
  vi.mocked(fileModule.supportsFileSystemAccess).mockReturnValueOnce(true);
  vi.mocked(fileModule.pickOpen).mockResolvedValueOnce({ name: 'locked.zwaggen.json' } as any);
  vi.mocked(fileModule.readFile).mockRejectedValueOnce(
    new Error('Permission denied'),
  );
  render(<AppHeader />);
  await clickOpen();
  const dialog = await screen.findByRole('dialog');
  // Filename isn't captured yet when readFile rejects; modal falls back to "—".
  expect(dialog).toHaveTextContent(/Permission denied/);
  expect(dialog).toHaveTextContent('—');
});
```

**Important — check the existing `vi.mock` factory:** when you added the mock in the prior plan, `supportsFileSystemAccess` was likely declared as `supportsFileSystemAccess: () => false` (a plain arrow, not a `vi.fn()`). For `vi.mocked(...).mockReturnValueOnce(true)` to work, it must be a `vi.fn()`. If it currently isn't, update the mock factory at the top of the file to:

```ts
supportsFileSystemAccess: vi.fn(() => false),
```

Leave the default-return as `false` so the existing three tests still exercise the upload branch.

Run:

```bash
pnpm --filter web test tests/ui/AppHeader.loadError.test.tsx 2>&1 | tee /tmp/io.log
grep -cE "An update to|wrapped in act" /tmp/io.log
pnpm --filter web test 2>&1 | tee /tmp/full.log
grep -cE "An update to|wrapped in act" /tmp/full.log
```

Both must be green, 0 act warnings.

Commit:

```
test(web): cover picker cancellation + readFile rejection in openSpec

AbortError from showOpenFilePicker → silent no-op, modal absent,
store unchanged. A mid-open readFile rejection surfaces through
the LoadErrorModal with the underlying message and an em-dash
filename fallback (the name isn't captured yet at that point).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 3. Archive + tick TODO

One commit inside the worktree:

- `git mv docs/specs/active/2026-04-21-open-spec-io-errors.md docs/specs/done/`
- `git mv docs/plans/active/2026-04-21-open-spec-io-errors.md docs/plans/done/`
- In `docs/TODO.md`, under `## Follow-up from shipped work`, flip the line `- [ ] Extend AppHeader.openSpec try/catch to cover the I/O phase...` to `- [x] ... — see docs/plans/done/2026-04-21-open-spec-io-errors.md.` (keeping the two-sentence description — not expanding here, short reference only, matching the style of the just-shipped `- [x] User-facing load-error modal on the web app — see docs/plans/done/...` line).
- Bump `Last updated:` to `2026-04-21 (open-spec-io-errors)`.

Commit:

```
docs: ship open-spec-io-errors — move spec+plan to done, tick TODO

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Execution strategy

One implementer subagent handles tasks 1+2. Spec-compliance + code-quality reviewers run in parallel. One archive subagent handles task 3. Master session FF-merges and asks before push.

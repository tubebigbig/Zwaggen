# Plan — Stop `uploadFile` from swallowing I/O errors in onchange

Spec: `docs/specs/active/2026-04-22-uploadfile-onchange-error.md`.

Execute on branch `plan/uploadfile-onchange-error` in `.worktrees/uploadfile-onchange-error`. All git ops inside the worktree. Two commits (fix + test) + one archive commit.

## Tasks

### 1. Add reject + try/catch to `uploadFile`

**File:** `apps/web/src/storage/file.ts` — replace lines 45–57:

```ts
export function uploadFile(accept = '.json,.zwaggen.json,application/json'): Promise<{ text: string; name: string } | null> {
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

with:

```ts
export function uploadFile(accept = '.json,.zwaggen.json,application/json'): Promise<{ text: string; name: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      try {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        const text = await f.text();
        resolve({ text, name: f.name });
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}
```

Three substantive changes vs. the old version:
- `(resolve, reject)` — second Promise executor argument.
- `try { ... } catch (err) { reject(err); }` wraps the entire onchange body.
- `resolve` is now called with `{ text, name: f.name }` where `text` is awaited first as its own local, avoiding the argument-evaluation-order subtlety that made the old bug easy to miss.

Verify:
```bash
cd /Users/victorliang/Zwaggen/.worktrees/uploadfile-onchange-error
pnpm --filter web exec tsc -b
```

Commit:
```bash
git add apps/web/src/storage/file.ts
git commit -m "$(cat <<'EOF'
fix(web): surface file.text() rejections through uploadFile's outer Promise

Before: async onchange with no reject meant any rejection inside
(f.text() failing on a revoked / corrupt file) vanished into an
unhandled-rejection, and uploadFile's outer Promise hung forever.
Symptom for the user: click Open, pick a file, UI freezes silent.

Now the onchange body is wrapped in try/catch and the outer Promise
gains a reject path. AppHeader.openSpec's widened catch (shipped in
open-spec-io-errors) now routes these rejections through the
LoadErrorModal on the non-FSA browsers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 2. Unit test for the rejection path

**File:** `apps/web/tests/storage/file.uploadFile.test.ts` (new).

The test has to fake the browser file picker: intercept `document.createElement('input')` so `.click()` programmatically sets `files` and fires `onchange`, then stub `File.prototype.text` to reject.

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { uploadFile } from '../../src/storage/file';

afterEach(() => {
  vi.restoreAllMocks();
});

function installFakePicker(file: File | null) {
  const realCreate = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'input') {
      // Intercept click so we can synthesize a file selection synchronously.
      el.click = () => {
        Object.defineProperty(el, 'files', {
          value: file ? [file] : [],
          configurable: true,
        });
        el.dispatchEvent(new Event('change'));
      };
    }
    return el;
  }) as typeof document.createElement);
  return spy;
}

describe('uploadFile — onchange error handling', () => {
  it('resolves null when no file is selected', async () => {
    installFakePicker(null);
    await expect(uploadFile()).resolves.toBeNull();
  });

  it('resolves { text, name } when the file reads successfully', async () => {
    const file = new File(['{"ok":true}'], 'spec.zwaggen.json', { type: 'application/json' });
    installFakePicker(file);
    await expect(uploadFile()).resolves.toEqual({ text: '{"ok":true}', name: 'spec.zwaggen.json' });
  });

  it('rejects when the selected file.text() rejects', async () => {
    const ioError = new Error('FileReader: permission revoked');
    const fakeFile = Object.assign(new File([''], 'locked.json'), {
      text: () => Promise.reject(ioError),
    });
    installFakePicker(fakeFile as File);
    await expect(uploadFile()).rejects.toBe(ioError);
  });
});
```

Notes for the implementer:
- If the test env (jsdom/happy-dom) does not provide `File` or `new File(...)`, the `document.createElement('input').dispatchEvent(new Event('change'))` trigger may need adapting. Check how other tests in `apps/web/tests` instantiate `File` — `AppHeader.importOpenApi.test.tsx` or `AppHeader.loadError.test.tsx` may have patterns.
- If `Object.assign(new File(...), { text: ... })` doesn't let you override `.text()` (File may freeze its prototype methods), fall back to creating a plain object that satisfies the structural shape `{ text(): Promise<string>; name: string }` and casting `as unknown as File`. The production code only uses `.text()` and `.name`, so a shim is sufficient.

Run:
```bash
pnpm --filter web test tests/storage/file.uploadFile.test.ts 2>&1 | tee /tmp/uf.log
grep -cE "An update to|wrapped in act" /tmp/uf.log
pnpm --filter web test 2>&1 | tee /tmp/full.log
grep -cE "An update to|wrapped in act" /tmp/full.log
```

Dedicated suite: 3/3 pass. Full suite green. 0 act warnings.

Commit:
```bash
git add apps/web/tests/storage/file.uploadFile.test.ts
git commit -m "$(cat <<'EOF'
test(web): cover uploadFile's reject path on file.text() failure

Fakes the browser file picker by intercepting document.createElement
so .click() synthesizes a file selection. Covers the three paths:
null-file resolves null, successful read resolves {text,name}, and
a rejecting .text() rejects the outer Promise — which AppHeader's
widened catch then routes through LoadErrorModal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 3. Archive + tick TODO

One commit inside the worktree:

- `git mv docs/specs/active/2026-04-22-uploadfile-onchange-error.md docs/specs/done/`
- `git mv docs/plans/active/2026-04-22-uploadfile-onchange-error.md docs/plans/done/`
- In `docs/TODO.md`, under `## Follow-up from shipped work`, flip the line:
  ```
  - [ ] `apps/web/src/storage/file.ts` `uploadFile()` swallows errors thrown inside its `input.onchange` async handler (`f.text()` rejections are lost; the outer Promise hangs forever, never resolves). Pre-existing — not regressed by `openSpec`'s widened catch, but the non-FSA branch of `openSpec` now implicitly relies on `uploadFile` rejecting on I/O failure. Wrap the onchange body in try/catch that resolves to an error sentinel (or rejects via a captured `reject`). Found during open-spec-io-errors code review.
  ```
  to:
  ```
  - [x] `apps/web/src/storage/file.ts` `uploadFile()` swallows errors thrown inside its `input.onchange` async handler — see `docs/plans/done/2026-04-22-uploadfile-onchange-error.md`.
  ```
- Bump `Last updated:` to `2026-04-22 (uploadfile-onchange-error)`.

```
docs: ship uploadfile-onchange-error — move spec+plan to done, tick TODO

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Execution strategy

One implementer subagent (tasks 1+2). Inline self-review by master. Archive subagent. FF-merge + push.

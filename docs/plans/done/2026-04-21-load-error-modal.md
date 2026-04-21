# Plan — User-facing load-error modal on Open Spec

Spec: `docs/specs/active/2026-04-21-load-error-modal.md`.

Execute on branch `plan/load-error-modal` in `.worktrees/load-error-modal`. **All git ops inside the worktree.** One commit per task + one archive commit.

## Tasks

### 1. `LoadErrorModal` component + i18n strings

**New file:** `apps/web/src/ui/LoadErrorModal.tsx`

Model after `DiffPanel.tsx` (`fixed inset-0` overlay, backdrop, card, close button). Keep it minimal — the modal is a one-off for now, no need for a generic `<Dialog>` abstraction.

Signature:

```tsx
interface LoadErrorModalProps {
  filename: string;
  message: string;
  onClose(): void;
}

export function LoadErrorModal({ filename, message, onClose }: LoadErrorModalProps) { ... }
```

Required content inside the card:
- Title: `t('loadErrorTitle')` — English "Couldn't open spec file", zh-TW "無法開啟規格檔案".
- A row showing the file name using `t('loadErrorFilenameLabel')` (en: "File", zh-TW: "檔案") — render the actual filename in a monospace chip so long names don't wrap weirdly.
- The raw `message` as plaintext in `<pre class="...">` so line breaks and numbers stay readable.
- A link row: `<a href="https://github.com/tubebigbig/Zwaggen/blob/main/docs/rules/spec-versioning.md" target="_blank" rel="noreferrer">{t('loadErrorLearnMore')}</a>` (en: "Learn about spec file versioning", zh-TW: "了解規格檔案版本").
- A close button (reuse the `IconX` + `btn-icon` pattern from DiffPanel) + an OK / Dismiss button. Clicking either calls `onClose`.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the title.

**Edit `apps/web/src/i18n/locales/en.json`** — add three keys. Slot them next to `importBadJson` / `diffBadJson` to keep related keys together. Suggested text:

```json
"loadErrorTitle": "Couldn't open spec file",
"loadErrorFilenameLabel": "File",
"loadErrorLearnMore": "Learn about spec file versioning"
```

Also add a dismiss button label if needed — reuse `t('dismiss')` which already exists ("Dismiss" / "關閉").

**Edit `apps/web/src/i18n/locales/zh-TW.json`** — mirror the three keys:

```json
"loadErrorTitle": "無法開啟規格檔案",
"loadErrorFilenameLabel": "檔案",
"loadErrorLearnMore": "了解規格檔案版本"
```

Run `pnpm --filter web exec tsc -b` to confirm the new .tsx compiles. Commit:

```
feat(web): add LoadErrorModal component + i18n strings

Dismissable overlay for spec-file load failures. Shows the filename,
the raw error message (JSON.parse / SpecVersionError both produce
user-readable text), and a link to docs/rules/spec-versioning.md on
GitHub. Not yet wired up — AppHeader integration lands next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 2. Wire into `openSpec` in AppHeader

**File:** `apps/web/src/ui/AppHeader.tsx`.

Near the other overlay state (`diffBase`, `batchOpen`), add:

```tsx
const [loadError, setLoadError] = useState<{ filename: string; message: string } | null>(null);
```

Replace the current `openSpec` body with explicit try/catch around the parse + fromJSON step. Both branches (File System Access + fallback upload) must catch. The File-System-Access branch has the filename on `h.getFile()` — `readFile` already returns `{ text, name }` — use that. The upload fallback returns `{ text, name }` from `uploadFile()`. Do NOT call `hydrateSecrets` or `replaceSpec` when parsing fails (the failed open must leave store state alone).

Sketch (adapt to match the existing function's style; keep `hydrateSecrets` as-is):

```tsx
async function openSpec() {
  async function hydrateSecrets(parsed: Spec): Promise<Spec> {
    /* unchanged */
  }

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

Add the modal render at the bottom of the header JSX, next to the existing `batchOpen` / `diffBase` conditionals:

```tsx
{loadError && (
  <LoadErrorModal
    filename={loadError.filename}
    message={loadError.message}
    onClose={() => setLoadError(null)}
  />
)}
```

Import `LoadErrorModal` from `./LoadErrorModal`. Import `FileHandle` type from `../storage/file` if TypeScript needs the annotation in the local variable.

Do NOT touch `importOpenApi` or `compareSpec` — those are out of scope for this plan.

Verify the build:
```bash
pnpm --filter web exec tsc -b
```

Commit:

```
feat(web): surface spec-file load errors in a modal

openSpec() previously let JSON.parse / fromJSON failures reject
silently — the user stared at the previous spec and wondered why
nothing changed. Now a dismissable modal names the failed file,
shows the SpecVersionError/SyntaxError message verbatim, and links
to docs/rules/spec-versioning.md for schemaVersion context. A failed
open leaves store state unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 3. Regression test

**New file:** `apps/web/tests/ui/AppHeader.loadError.test.tsx`.

Model after other AppHeader tests in the same directory. The key trick is mocking `../../src/storage/file`'s `pickOpen`, `uploadFile`, `readFile`, and `supportsFileSystemAccess` so the test can inject any `text` / `name` pair without a real file dialog. Use `vi.mock()` for this — the rest of AppHeader is rendered normally.

Skeleton:

```tsx
import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { emptySpec } from '@zwaggen/core';
import { useSpecStore } from '../../src/state/store';

vi.mock('../../src/storage/file', () => ({
  supportsFileSystemAccess: () => false,
  pickOpen: vi.fn(),
  readFile: vi.fn(),
  uploadFile: vi.fn(),
  pickSave: vi.fn(),
  downloadBlob: vi.fn(),
  writeFile: vi.fn(),
}));

import { AppHeader } from '../../src/ui/AppHeader';
import * as fileModule from '../../src/storage/file';

async function clickOpen() {
  const openBtn = screen.getAllByRole('button', { name: /^Open$/ })[0]!;
  await userEvent.click(openBtn);
}

beforeEach(async () => {
  await act(async () => {
    await useSpecStore.getState().replaceSpec(emptySpec(), null);
  });
});

it('surfaces a modal with the filename and SyntaxError for malformed JSON', async () => {
  vi.mocked(fileModule.uploadFile).mockResolvedValueOnce({ name: 'broken.zwaggen.json', text: '{not json' });
  render(<AppHeader />);
  await clickOpen();
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('broken.zwaggen.json');
  // SyntaxError text varies between engines but always contains "JSON"
  expect(dialog.textContent).toMatch(/JSON/i);
});

it('surfaces a modal with SpecVersionError message for newer schemaVersion', async () => {
  vi.mocked(fileModule.uploadFile).mockResolvedValueOnce({
    name: 'future.zwaggen.json',
    text: JSON.stringify({ schemaVersion: 999, info: { name: 'x', baseUrl: '' } }),
  });
  render(<AppHeader />);
  await clickOpen();
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('future.zwaggen.json');
  expect(dialog).toHaveTextContent(/schemaVersion 999/);
});

it('dismissing the modal clears it and leaves the store untouched', async () => {
  const before = useSpecStore.getState().spec;
  vi.mocked(fileModule.uploadFile).mockResolvedValueOnce({ name: 'broken.json', text: 'not json' });
  render(<AppHeader />);
  await clickOpen();
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: /dismiss/i }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(useSpecStore.getState().spec).toEqual(before);
});
```

Resolve whatever imports the skeleton uses (`within`, etc.). The existing `AppHeader` tests in the same dir are good reference for mount patterns.

Run:

```bash
pnpm --filter web test tests/ui/AppHeader.loadError.test.tsx
pnpm --filter web test   # full regression pass
```

Both must be green, zero act warnings. Commit:

```
test(web): cover LoadErrorModal for openSpec failures

Three cases: malformed JSON surfaces SyntaxError + filename,
schemaVersion: 999 surfaces the SpecVersionError message, and
dismissing the modal restores the previous store state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 4. Archive + tick TODO

One commit:

- `git mv docs/specs/active/2026-04-21-load-error-modal.md docs/specs/done/`
- `git mv docs/plans/active/2026-04-21-load-error-modal.md docs/plans/done/`
- In `docs/TODO.md`, under `## Follow-up from shipped work`, flip `- [ ] User-facing load-error modal on the web app — ...` to `- [x] ... — see docs/plans/done/2026-04-21-load-error-modal.md`.
- Bump `Last updated:` to `2026-04-21 (load-error-modal)`.

```
docs: ship load-error-modal — move spec+plan to done, tick TODO

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Execution strategy

One implementer subagent handles tasks 1–3 (three commits, inside the worktree). One archive subagent handles task 4. Spec-compliance + code-quality review after the implementer finishes.

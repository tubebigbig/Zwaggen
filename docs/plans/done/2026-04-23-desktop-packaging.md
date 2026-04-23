# Zwaggen Desktop slice 2 — Packaging + icons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@zwaggen/desktop` packageable into per-OS artifacts (.dmg / .exe / .AppImage) with brand icons, no signing.

**Architecture:** electron-builder configured via `electron-builder.yml`. App icons generated from the existing `apps/docs/public/favicon.svg` via a one-shot Node script (`sharp` + `png-to-ico`); generated PNG/ICO are committed so non-mac contributors don't need to render. The macOS .icns is generated only on darwin via `iconutil`; otherwise electron-builder derives one from `icon.png`. `main.ts` learns about `app.isPackaged` to resolve the renderer at the right path in both unpacked and packaged modes.

**Tech Stack:** electron-builder ^25, sharp ^0.34, png-to-ico ^3, no other new deps. Stacks on `plan/desktop-electron-scaffold`.

---

### Spec

See `docs/specs/active/2026-04-23-desktop-packaging.md` for full context. Key constraints:

- No signing, no notarization, no GitHub release workflow in this slice.
- Stacked PR — base must be `plan/desktop-electron-scaffold`.
- `extraResources` puts `apps/web/dist/` at `<Resources>/web/` inside the package.

---

### Task 1: Add deps + icon-generation script

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/scripts/build-icons.mjs`
- Create: `apps/desktop/.gitignore` (if not already covering `release/`)

- [ ] **Step 1: Add devDeps + scripts to `apps/desktop/package.json`**

Add to `devDependencies` (alongside the existing entries):
```jsonc
"electron-builder": "^25.1.8",
"sharp": "^0.34.5",
"png-to-ico": "^3.0.1"
```

Add to `scripts` (after existing entries):
```jsonc
"build:icons": "node scripts/build-icons.mjs",
"pack": "pnpm build && pnpm --filter @zwaggen/web build && electron-builder --dir",
"release": "pnpm build && pnpm --filter @zwaggen/web build && electron-builder"
```

Add a top-level `"build"` field that points electron-builder at the YAML config (electron-builder reads `electron-builder.yml` automatically when present, but make it explicit):
```jsonc
"build": {
  "extends": null
}
```

(Optional — only needed if electron-builder picks up something unexpected from `package.json`; usually not required.)

- [ ] **Step 2: Append `release/` to `apps/desktop/.gitignore`**

```
release/
build/icon.iconset/
```

(`.iconset` is a temp directory the icon script creates and removes; ignore in case of crashes.)

- [ ] **Step 3: Write `apps/desktop/scripts/build-icons.mjs`**

```js
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', '..', 'docs', 'public', 'favicon.svg');
const OUT = resolve(__dirname, '..', 'build');
const ICONS = resolve(OUT, 'icons');
const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

await mkdir(ICONS, { recursive: true });

const buffers = await Promise.all(
  SIZES.map(async (size) => {
    const buf = await sharp(SRC).resize(size, size).png().toBuffer();
    await writeFile(resolve(ICONS, `${size}x${size}.png`), buf);
    return { size, buf };
  }),
);

const findBuf = (size) => buffers.find((b) => b.size === size).buf;

await writeFile(resolve(OUT, 'icon.png'), findBuf(1024));

const icoSizes = [16, 32, 48, 64, 128, 256];
const icoBuf = await pngToIco(icoSizes.map((s) => resolve(ICONS, `${s}x${s}.png`)));
await writeFile(resolve(OUT, 'icon.ico'), icoBuf);

if (process.platform === 'darwin') {
  const iconset = resolve(OUT, 'icon.iconset');
  await rm(iconset, { recursive: true, force: true });
  await mkdir(iconset, { recursive: true });
  // Apple expects: icon_<N>x<N>.png + icon_<N>x<N>@2x.png pairs
  const macSizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of macSizes) {
    if (s !== 1024) await writeFile(resolve(iconset, `icon_${s}x${s}.png`), findBuf(s));
    if (s !== 16) await writeFile(resolve(iconset, `icon_${s/2}x${s/2}@2x.png`), findBuf(s));
  }
  await exec('iconutil', ['-c', 'icns', '-o', resolve(OUT, 'icon.icns'), iconset]);
  await rm(iconset, { recursive: true, force: true });
}

console.log('Icons generated to', OUT);
```

- [ ] **Step 4: Install + run the icon generator**

```bash
pnpm install
pnpm --filter @zwaggen/desktop build:icons
ls apps/desktop/build/
```

Expected output: `icon.png`, `icon.ico`, `icons/` dir with the per-size PNGs, plus `icon.icns` if running on macOS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/.gitignore apps/desktop/scripts/build-icons.mjs apps/desktop/build pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(desktop): add icon generator + commit per-OS app icons

sharp + png-to-ico generate icon.png + icon.ico from the brand SVG.
Native iconutil produces icon.icns when run on macOS; off-mac builds
let electron-builder derive .icns from icon.png automatically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add electron-builder config

**Files:**
- Create: `apps/desktop/electron-builder.yml`

- [ ] **Step 1: Write the config**

```yaml
appId: com.zwaggen.desktop
productName: Zwaggen
copyright: © 2026 Victor Liang
asar: true

directories:
  output: release
  buildResources: build

files:
  - dist/**/*
  - package.json

extraResources:
  - from: ../web/dist
    to: web

mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
      arch:
        - arm64
        - x64
  identity: null
  icon: build/icon.icns

dmg:
  sign: false

win:
  target:
    - target: nsis
      arch:
        - x64
    - target: zip
      arch:
        - x64
  icon: build/icon.ico

linux:
  target:
    - target: AppImage
      arch:
        - x64
  category: Development
  icon: build/icon.png
```

- [ ] **Step 2: Lightweight assertion that the config parses + holds the expected appId**

Create `apps/desktop/electron/__tests__/builder-config.test.ts`:

```ts
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfgPath = resolve(__dirname, '..', '..', 'electron-builder.yml');

test('electron-builder.yml parses and has the expected app identity', () => {
  const cfg = parse(readFileSync(cfgPath, 'utf8'));
  expect(cfg.appId).toBe('com.zwaggen.desktop');
  expect(cfg.productName).toBe('Zwaggen');
  expect(cfg.mac.identity).toBeNull();
  expect(cfg.mac.target).toEqual([{ target: 'dmg', arch: ['arm64', 'x64'] }]);
  expect(cfg.win.target.map((t) => t.target)).toEqual(['nsis', 'zip']);
  expect(cfg.linux.target).toEqual([{ target: 'AppImage', arch: ['x64'] }]);
  expect(cfg.extraResources).toEqual([{ from: '../web/dist', to: 'web' }]);
});
```

This needs `yaml` as a devDep — check whether it's already installed in the workspace:

```bash
ls node_modules/.pnpm | grep -E '^yaml@'
```

If not, add it to `apps/desktop/package.json` devDeps:
```jsonc
"yaml": "^2.5.0"
```

- [ ] **Step 3: Run the new test**

```bash
pnpm install   # if yaml was added
pnpm --filter @zwaggen/desktop test
```

Expected: 7 tests passing (6 from slice 1 + 1 new).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron-builder.yml apps/desktop/electron/__tests__/builder-config.test.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(desktop): electron-builder config for mac/win/linux targets (unsigned)

dmg + nsis/zip + AppImage. extraResources places apps/web/dist at
<Resources>/web inside the package. asar enabled. Identity null
(slice 2 ships unsigned; signing is a later slice).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Teach `main.ts` to resolve the renderer based on `app.isPackaged`

**Files:**
- Modify: `apps/desktop/electron/main.ts`

- [ ] **Step 1: Add the resolver**

Open `apps/desktop/electron/main.ts`. Find the existing renderer-loading block:

```ts
if (isDev) {
  void mainWindow.loadURL(process.env.ZWAGGEN_DEV_URL!);
  mainWindow.webContents.openDevTools({ mode: 'detach' });
} else {
  // Resolve apps/web/dist/index.html relative to the desktop package's dist/
  const indexHtml = path.join(__dirname, '..', '..', 'web', 'dist', 'index.html');
  void mainWindow.loadFile(indexHtml);
}
```

Replace with:

```ts
if (isDev) {
  void mainWindow.loadURL(process.env.ZWAGGEN_DEV_URL!);
  mainWindow.webContents.openDevTools({ mode: 'detach' });
} else {
  void mainWindow.loadFile(resolveRendererIndex());
}
```

Add the resolver above `createWindow`:

```ts
function resolveRendererIndex(): string {
  if (app.isPackaged) {
    // electron-builder.yml extraResources places apps/web/dist at <Resources>/web/
    return path.join(process.resourcesPath, 'web', 'index.html');
  }
  // Unpacked dev/start: walk from apps/desktop/dist/ to apps/web/dist/
  return path.join(__dirname, '..', '..', 'web', 'dist', 'index.html');
}
```

- [ ] **Step 2: Verify slice 1's e2e still passes**

The e2e launches the unpacked main.cjs, so `app.isPackaged` is false → resolver returns the unpacked path → behaviour unchanged.

```bash
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop e2e
```

Expected: 1 test passing.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/main.ts
git commit -m "$(cat <<'EOF'
feat(desktop): resolve renderer via app.isPackaged

Packaged mode reads from process.resourcesPath/web/index.html; unpacked
dev/start keeps the apps/web/dist relative path. Lets the same main.cjs
serve both modes without env vars.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual smoke pack

**Files:** none modified — verification only.

- [ ] **Step 1: Run a `--dir` build (fastest, unpacked)**

```bash
pnpm --filter @zwaggen/desktop pack
```

Expected:
- Builds tsup → `apps/desktop/dist/`.
- Builds Vite → `apps/web/dist/`.
- electron-builder produces `apps/desktop/release/<platform>-unpacked/`.

On macOS: `apps/desktop/release/mac-arm64-unpacked/Zwaggen.app` (and `mac-x64-unpacked` if both archs run).

- [ ] **Step 2: Visually inspect the output**

```bash
ls -la apps/desktop/release/
```

Confirm a `*-unpacked/` dir exists with an `.app` (mac), `Zwaggen.exe` (win), or AppImage staging (linux).

- [ ] **Step 3: (Optional, mac only) Launch the unpacked app**

```bash
open apps/desktop/release/mac-arm64-unpacked/Zwaggen.app
```

Expected: window opens; brand icon appears in the dock; UI loads. Click the **File** menu → **Open**, pick a `.zwag` JSON file, confirm it loads. Close.

(This is a manual smoke; no automated e2e for this slice. Document the runbook in the README.)

- [ ] **Step 4: No commit** — verification only.

---

### Task 5: Update README

**Files:**
- Modify: `apps/desktop/README.md`

- [ ] **Step 1: Append packaging section to the README**

After the existing "Test" section, add:

````markdown
## Package

Build platform-specific artifacts under `release/`. Slice 2 ships unsigned — users will see Gatekeeper / SmartScreen warnings until a future slice adds code signing.

Quick local smoke (unpacked, fastest):
```
pnpm --filter @zwaggen/desktop pack
```
Output: `release/<platform>-unpacked/`. On macOS, `open release/mac-arm64-unpacked/Zwaggen.app`.

Real installers:
```
pnpm --filter @zwaggen/desktop release
```
Output:
- macOS: `release/Zwaggen-<version>-arm64.dmg` and `release/Zwaggen-<version>.dmg`.
- Windows: `release/Zwaggen Setup <version>.exe` and `release/Zwaggen-<version>-win.zip`.
- Linux: `release/Zwaggen-<version>.AppImage`.

### Cross-build constraints

- macOS targets (`.dmg`) build only on macOS.
- Windows targets build natively on Windows; on macOS/Linux electron-builder uses Wine (slow, occasionally flaky).
- Linux AppImage builds on macOS and Linux.

For now, build on the host OS that matches your target. CI matrix is a future slice.

### Icons

Brand icons live at `build/icon.{png,ico,icns}`, generated from `apps/docs/public/favicon.svg`. Regenerate with:
```
pnpm --filter @zwaggen/desktop build:icons
```

The generated PNG + ICO are committed so non-mac contributors don't need `sharp` / `iconutil` to build. The .icns is regenerated on macOS only via Xcode's `iconutil`; off-mac builds fall back to electron-builder deriving an .icns from `icon.png`.
````

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/README.md
git commit -m "$(cat <<'EOF'
docs(desktop): document packaging — pack/release scripts + cross-build notes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tick TODO and move spec + plan to `done/`

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Tick the slice 2 TODO entry**

Find the line added in slice 1:

```
- [ ] Zwaggen Desktop slice 2 — `electron-builder` packaging (.dmg / .exe / .AppImage); no signing yet.
```

Replace with:

```
- [x] Zwaggen Desktop slice 2 — `electron-builder` packaging (.dmg / .exe / .AppImage); no signing yet. Brand icons generated from favicon.svg. See `docs/plans/done/2026-04-23-desktop-packaging.md`.
```

Add new follow-up bullets (under the existing Desktop list, or in the Follow-up section):

```
- [ ] Zwaggen Desktop slice 3 — `.zwag` file association + Recents UI (File → Open Recent).
- [ ] Zwaggen Desktop slice 4 — hardening polish (cloud-metadata IP blocklist on IPC HTTP, AbortSignal timeout, concurrently dev script, StrictMode menu cleanup, CI step for desktop tests).
- [ ] Zwaggen Desktop — code signing (mac notarization + Windows EV) — deferred until ready to ship publicly.
```

Update the "Last updated" line at the top to `2026-04-23 (desktop-packaging)`.

- [ ] **Step 2: Move spec + plan to done/**

```bash
git mv docs/specs/active/2026-04-23-desktop-packaging.md docs/specs/done/
git mv docs/plans/active/2026-04-23-desktop-packaging.md docs/plans/done/
```

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship desktop slice 2 (packaging) — move spec+plan to done

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 6 tasks ticked.
- `pnpm --filter @zwaggen/desktop test` passes (7 tests including new builder-config sanity check).
- `pnpm --filter @zwaggen/desktop pack` produces an unpacked artifact under `release/`.
- Slice 1 e2e still passes (`pnpm --filter @zwaggen/desktop e2e`).
- Branch `plan/desktop-packaging` ready to push (PR base = `plan/desktop-electron-scaffold`).

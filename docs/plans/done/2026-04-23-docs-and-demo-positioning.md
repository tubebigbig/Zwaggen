# Docs sweep + playground demo positioning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell users (a) the hosted playground is a CORS-limited demo + spec generator, (b) Zwaggen Desktop is coming soon and links to a "coming-soon" docs page, and (c) sweep existing guide pages so they reference shipped features.

**Architecture:** Banner + AppHeader link in `apps/web`; new desktop guide page (coming-soon) + sidebar entry + home/quickstart/cors-proxy mentions in `apps/docs`. Both locales. No new packages.

**Tech Stack:** React, vitest, VitePress, i18next. No new deps.

---

### Spec

See `docs/specs/active/2026-04-23-docs-and-demo-positioning.md`. Critical: the new docs page is positioned as **coming soon** — no install commands, no Gatekeeper workaround copy. Just describes what's planned + a "build from source for developers" footnote.

---

### Task 1: `DemoBanner` component + i18n strings

**Files:**
- Create: `apps/web/src/ui/DemoBanner.tsx`
- Create: `apps/web/tests/ui/DemoBanner.test.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/zh-TW.json`
- Modify: `apps/web/src/App.tsx` (mount above AppHeader)

- [ ] **Step 1: Add i18n strings**

`en.json`:
```json
"demoBannerText": "Zwaggen Web is a CORS-limited demo + spec generator.",
"demoBannerCta": "Zwaggen Desktop is coming soon →",
"dismiss": "Dismiss",
"downloadDesktop": "Zwaggen Desktop · coming soon"
```

`zh-TW.json`:
```json
"demoBannerText": "Zwaggen Web 是受 CORS 限制的展示環境 + 規格產生器。",
"demoBannerCta": "Zwaggen Desktop 即將推出 →",
"dismiss": "關閉",
"downloadDesktop": "Zwaggen Desktop · 即將推出"
```

- [ ] **Step 2: Write the component + failing test**

Component (`apps/web/src/ui/DemoBanner.tsx`):

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DISMISS_KEY = 'zwaggen.banner.demo.v1';
const DESKTOP_URL = 'https://docs.zwaggen.com/guide/desktop';

export function DemoBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) !== '1');
  }, []);

  if (!show) return null;
  return (
    <div className="border-b border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2">
        <span className="flex-1">
          {t('demoBannerText')}{' '}
          <a
            href={DESKTOP_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline"
          >
            {t('demoBannerCta')}
          </a>
        </span>
        <button
          type="button"
          aria-label={t('dismiss')}
          className="px-1 text-indigo-600 transition hover:text-indigo-900"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setShow(false);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

Test (`apps/web/tests/ui/DemoBanner.test.tsx`):

```tsx
import { afterEach, beforeEach, expect, test } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { DemoBanner } from '../../src/ui/DemoBanner';
import i18n from '../../src/i18n';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function withI18n(node: React.ReactNode) {
  return <I18nextProvider i18n={i18n}>{node}</I18nextProvider>;
}

test('renders by default and links to the desktop coming-soon page', () => {
  render(withI18n(<DemoBanner />));
  const link = screen.getByRole('link');
  expect(link.getAttribute('href')).toBe('https://docs.zwaggen.com/guide/desktop');
});

test('dismiss persists in localStorage and hides the banner', () => {
  const { container } = render(withI18n(<DemoBanner />));
  fireEvent.click(screen.getByLabelText(/dismiss/i));
  expect(localStorage.getItem('zwaggen.banner.demo.v1')).toBe('1');
  expect(container.querySelector('a')).toBeNull();
});

test('does not render when previously dismissed', () => {
  localStorage.setItem('zwaggen.banner.demo.v1', '1');
  const { container } = render(withI18n(<DemoBanner />));
  expect(container.querySelector('a')).toBeNull();
});
```

- [ ] **Step 3: Mount in `App.tsx`**

In `apps/web/src/App.tsx`, add the import + render the banner immediately above `<AppHeader />`:

```tsx
import { DemoBanner } from './ui/DemoBanner';

// ... in the JSX return ...
return (
  <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
    <DemoBanner />
    <AppHeader />
    {/* ... rest unchanged ... */}
  </div>
);
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter web test -- DemoBanner
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/DemoBanner.tsx apps/web/tests/ui/DemoBanner.test.tsx apps/web/src/i18n/locales/en.json apps/web/src/i18n/locales/zh-TW.json apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(web): demo banner above AppHeader

Dismissible banner positions Zwaggen Web as a CORS-limited demo +
spec generator and links to the upcoming Zwaggen Desktop docs page.
Dismiss state persists in localStorage keyed by version (v1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: AppHeader desktop link

**Files:**
- Modify: `apps/web/src/ui/AppHeader.tsx`

- [ ] **Step 1: Read the existing header right-side cluster**

Find the cluster of icon links (GitHub, lang toggle). Insert a new link near them.

- [ ] **Step 2: Add the link**

Use the `useTranslation` hook (already imported) and add:

```tsx
<a
  href="https://docs.zwaggen.com/guide/desktop"
  target="_blank"
  rel="noreferrer"
  title={t('downloadDesktop')}
  className="text-xs text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
>
  {t('downloadDesktop')}
</a>
```

(Use a text link rather than an icon since "Coming Soon" needs explanation. If the existing layout looks crowded, hide the text on small screens with `hidden sm:inline`.)

- [ ] **Step 3: Run tests + lint**

```bash
pnpm --filter web test
pnpm --filter web lint
```

Existing AppHeader tests should still pass; the new link has no required interactivity.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/ui/AppHeader.tsx
git commit -m "$(cat <<'EOF'
feat(web): AppHeader link to Zwaggen Desktop coming-soon page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: New docs `desktop.md` page (en + zh-TW) + sidebar entries

**Files:**
- Create: `apps/docs/guide/desktop.md`
- Create: `apps/docs/zh-TW/guide/desktop.md`
- Modify: `apps/docs/.vitepress/config.ts`

- [ ] **Step 1: Write the en page**

`apps/docs/guide/desktop.md`:

```markdown
---
title: Zwaggen Desktop
description: Cross-platform Electron app for editing specs and running requests without CORS — coming soon.
---

# Zwaggen Desktop

::: tip Coming Soon
Zwaggen Desktop is in active development. Slices 1–4 (the local-test-first track) shipped on 2026-04-23, but downloadable binaries are not yet available — the release workflow + code-signing slices haven't landed. **Watch the [GitHub repository](https://github.com/tubebigbig/Zwaggen) for releases.**
:::

A native desktop app for editing specs and running requests against any API, with **no CORS limitations**. The hosted [Zwaggen Web](https://play.zwaggen.com) is great for browsing the spec builder UX and generating specs, but every cross-origin request hits browser CORS — which most APIs reject without explicit allow-list rules. Zwaggen Desktop runs requests through the OS network stack instead, the same way curl or Postman does.

## What's coming

- **CORS-free request runner** — every HTTP request goes through the Electron main process, bypassing browser CORS entirely.
- **Native file dialogs** — Open / Save with your OS's real picker.
- **`.zwag` file association** — double-click a spec in Finder/Explorer to open it.
- **Recents menu** — File → Open Recent, persisted to disk, integrated with the OS recent-docs surface (macOS dock right-click, Windows jump list).
- **Strict security baseline** — context-isolated renderer, sandboxed, no Node access from the UI, no outbound network from the renderer.
- **Cross-platform** — macOS (Intel + Apple Silicon), Windows, Linux.

## Try the in-progress build (developers)

If you want to try Zwaggen Desktop today, you can build it from source. **This is for developers experimenting with the feature**, not for general use:

```bash
git clone https://github.com/tubebigbig/Zwaggen.git
cd Zwaggen
pnpm install
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop run release
```

Artifacts land in `apps/desktop/release/`. They are **unsigned**, so launching them triggers Gatekeeper / SmartScreen warnings. Installation guidance for general users will land here when official signed builds are available.

## Until it ships

Use [Zwaggen Web](https://play.zwaggen.com) for spec editing and demo requests, plus the [`@zwaggen/cli`](/installation) for headless / CI runs. Both work today.
```

- [ ] **Step 2: Write the zh-TW page**

`apps/docs/zh-TW/guide/desktop.md`:

```markdown
---
title: Zwaggen Desktop
description: 跨平台的 Electron 應用程式,用於編輯規格與執行不受 CORS 限制的請求 — 即將推出。
---

# Zwaggen Desktop

::: tip 即將推出
Zwaggen Desktop 正在積極開發中。本機開發測試的階段(slice 1–4)已於 2026-04-23 完成,但下載用的二進位檔尚未可用 — release 工作流程與程式碼簽署的階段尚未完成。**請關注 [GitHub 儲存庫](https://github.com/tubebigbig/Zwaggen) 以取得發布資訊。**
:::

原生桌面應用程式,可以編輯規格並對任何 API 執行請求,**完全不受 CORS 限制**。網頁版 [Zwaggen Web](https://play.zwaggen.com) 適合瀏覽規格建構介面與產生規格,但所有跨來源請求都會被瀏覽器 CORS 機制阻擋 — 多數 API 在沒有明確的允許清單規則時都會拒絕。Zwaggen Desktop 透過作業系統的網路層執行請求,與 curl 或 Postman 的運作方式相同。

## 即將推出的功能

- **無 CORS 限制的請求執行** — 所有 HTTP 請求都透過 Electron 主行程進行,完全繞過瀏覽器的 CORS。
- **原生檔案對話框** — 使用作業系統真正的開啟 / 儲存對話框。
- **`.zwag` 檔案關聯** — 在 Finder / 檔案總管中雙擊規格檔即可開啟。
- **最近開啟選單** — 檔案 → 最近開啟,以磁碟方式持久化,與作業系統的最近文件介面整合 (macOS dock 右鍵選單、Windows jump list)。
- **嚴格的安全基準** — 渲染程序使用 context isolation 與 sandbox,UI 端無法存取 Node,渲染程序也不會發出對外網路請求。
- **跨平台** — macOS(Intel + Apple Silicon)、Windows、Linux。

## 試用開發中的版本(開發者)

如果你想今天就試用 Zwaggen Desktop,可以從原始碼建置。**這是給體驗中功能的開發者使用**,不適合一般使用者:

```bash
git clone https://github.com/tubebigbig/Zwaggen.git
cd Zwaggen
pnpm install
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop run release
```

產生的檔案會放在 `apps/desktop/release/`。這些是**未簽署**的,啟動時會觸發 Gatekeeper / SmartScreen 警告。當官方簽署版本完成後,一般使用者的安裝說明會放在此頁。

## 在桌面版推出之前

請使用 [Zwaggen Web](https://play.zwaggen.com) 編輯規格與執行示範請求,以及 [`@zwaggen/cli`](/zh-TW/installation) 進行無介面 / CI 執行。兩者今天都可使用。
```

- [ ] **Step 3: Add sidebar entries**

In `apps/docs/.vitepress/config.ts`, add a Desktop entry to both locales' `Guide` sidebar. Place it after Codegen:

en sidebar Guide section:
```ts
{ text: 'Codegen', link: '/guide/codegen' },
{ text: 'Desktop', link: '/guide/desktop' },
{ text: 'Spec Diff', link: '/guide/spec-diff' },
```

zh-TW sidebar 指南 section:
```ts
{ text: 'Codegen 程式碼產生', link: '/zh-TW/guide/codegen' },
{ text: '桌面應用', link: '/zh-TW/guide/desktop' },
{ text: '規格差異', link: '/zh-TW/guide/spec-diff' },
```

- [ ] **Step 4: Build the docs site to verify**

```bash
pnpm --filter docs build
```

Expected: clean build (no broken-link warnings, sidebar shows Desktop entry).

- [ ] **Step 5: Commit**

```bash
git add apps/docs/guide/desktop.md apps/docs/zh-TW/guide/desktop.md apps/docs/.vitepress/config.ts
git commit -m "$(cat <<'EOF'
docs: add Zwaggen Desktop coming-soon page (en + zh-TW)

Coming-soon positioning until the release workflow + code-signing slices
land. No install commands; just what's coming, what's shipped, and a
"build from source for developers" footnote.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Sweep existing pages

**Files:**
- Modify: `apps/docs/index.md` (en home page)
- Modify: `apps/docs/zh-TW/index.md` (zh-TW home page)
- Modify: `apps/docs/quickstart.md` (en)
- Modify: `apps/docs/zh-TW/quickstart.md` (zh-TW)
- Modify: `apps/docs/guide/cors-proxy.md` (en)
- Modify: `apps/docs/zh-TW/guide/cors-proxy.md` (zh-TW)
- Verify (and edit if drifted): `apps/docs/guide/codegen.md` + `apps/docs/zh-TW/guide/codegen.md`
- Verify (and edit if drifted): `apps/docs/guide/folders.md` + `apps/docs/zh-TW/guide/folders.md`
- Verify (and edit if drifted): `apps/docs/guide/type-inheritance.md` + `apps/docs/zh-TW/guide/type-inheritance.md`

- [ ] **Step 1: Home page hero / features**

In `apps/docs/index.md`, find the existing hero / features section. If it lists "Zwaggen Web" and "CLI", add a third card or bullet for "Zwaggen Desktop · Coming soon" linking to `/guide/desktop`. Don't restructure if the layout doesn't have a card system; just append a one-line "Zwaggen Desktop is on the way — see [the desktop page](/guide/desktop)" near the existing CTAs.

Mirror in `zh-TW/index.md`.

- [ ] **Step 2: Quickstart**

Append a small note near the top of `quickstart.md` (after the existing intro paragraph):

> **Heads up:** A native desktop app, **Zwaggen Desktop**, is coming soon for CORS-free API testing. See [Desktop](/guide/desktop) for details. Until then, this guide uses Zwaggen Web.

Mirror in `zh-TW/quickstart.md`:

> **預告:** 原生桌面應用程式 **Zwaggen Desktop** 即將推出,提供無 CORS 限制的 API 測試。詳見 [桌面應用](/zh-TW/guide/desktop)。在此之前,本指南使用 Zwaggen Web。

- [ ] **Step 3: CORS Proxy guide**

In `cors-proxy.md`, near the top of the page, add a brief forward-looking note:

> **Coming soon:** Zwaggen Desktop runs requests through the OS network stack, so CORS doesn't apply at all and you won't need a proxy. See [Desktop](/guide/desktop). Until it ships, this guide covers the proxy approach for Zwaggen Web.

Mirror in zh-TW.

- [ ] **Step 4: Verify codegen / folders / type-inheritance pages**

Open each (both locales) and skim. Verify:

- `codegen.md` — covers v1 generator basics. Append a short "v1.1 additions" section if it doesn't already mention folder-key sanitization, inline types, async headers, or tag camelization. (If it does, skip.)
- `folders.md` — confirms drag-and-drop is mentioned. (Should be — added in slice 2026-04-22.) Skip if present.
- `type-inheritance.md` — confirms drag-reorder of `extends` chips is mentioned. Skip if present.

For any page that needs an edit, keep it minimal — one paragraph or a small bullet list. Don't restructure.

- [ ] **Step 5: Build the docs site**

```bash
pnpm --filter docs build
```

Expected: clean. No new broken links.

- [ ] **Step 6: Commit**

```bash
git add apps/docs
git commit -m "$(cat <<'EOF'
docs: sweep home/quickstart/cors-proxy + verify codegen/folders/inheritance

Forward-looking mention of Zwaggen Desktop on home, quickstart, and the
CORS proxy page. Codegen page extended to mention v1.1 additions if it
hadn't yet. zh-TW counterparts updated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tick TODO + move spec/plan to done

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Add the TODO entry (and tick it)**

Add a new bullet under the Feature section (or wherever you placed the desktop entries). The TODO didn't list this slice explicitly — add it ticked since you're shipping it now:

```
- [x] Docs sweep + playground demo positioning — apps/web demo banner + AppHeader desktop link; new "coming soon" `apps/docs/guide/desktop.md` page (en + zh-TW); home / quickstart / cors-proxy mention desktop; sidebar entry. See `docs/plans/done/2026-04-23-docs-and-demo-positioning.md`.
```

Update "Last updated" stamp.

- [ ] **Step 2: Move spec + plan to done/**

```bash
git mv docs/specs/active/2026-04-23-docs-and-demo-positioning.md docs/specs/done/
git mv docs/plans/active/2026-04-23-docs-and-demo-positioning.md docs/plans/done/
```

- [ ] **Step 3: Final sweep**

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter docs build
```

All clean.

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship docs-and-demo-positioning — move spec+plan to done

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 5 tasks ticked.
- `pnpm --filter web test`, `pnpm --filter web lint`, `pnpm --filter docs build` all green.
- Coming-soon framing consistent across the new desktop page, the banner, the AppHeader link, the home/quickstart/cors-proxy mentions.
- No mention of Gatekeeper workaround, AppImage commands, or download URLs.
- Branch `plan/docs-and-demo-positioning` ready to push (PR base = `main`).

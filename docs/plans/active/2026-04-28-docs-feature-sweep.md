# Docs sweep for recently shipped features (Slice 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `apps/docs/` user-facing tutorial pages to reflect 7 user-visible UX features shipped over the last week (3-dot menus, ExportPopover, LivePreviewPanel, folder + Add button, Duplicate, Delete folder cascade, save-flow polish).

**Architecture:** Pure docs editing across 12 markdown files (6 en + 6 zh-TW): 3 high-impact rewrites (`folders.md`, `export-and-curl.md`, `type-builder.md`) and 3 light touches (`endpoints.md`, `introduction.md`, `codegen.md`). Plus 1 new TODO entry for the deferred screenshot refresh.

**Tech Stack:** Markdown + VitePress. No code changes.

---

### Spec

See `docs/specs/active/2026-04-28-docs-feature-sweep.md`.

---

### Task 1: High-priority docs rewrites — en

**Files:**
- Modify: `apps/docs/guide/folders.md` — pencil-rename → 3-dot menu walkthrough; add "+ Add" button section; add Delete folder cascade section.
- Modify: `apps/docs/guide/export-and-curl.md` — add a major new section on the per-endpoint/type/folder Export popover (5/3/4 tabs with Copy + Download).
- Modify: `apps/docs/guide/type-builder.md` — add a "Row affordances" section covering Export / Duplicate / Delete via the 3-dot menu.

- [ ] **Step 1: `folders.md` — replace pencil-rename, add + button + Delete folder sections**

Find the section describing folder rename via the pencil icon (around the lines that mention "small pencil button on the right" or similar). Replace with:

```markdown
### Renaming a folder

Hover a folder row and click the **⋯ (more)** button on the right. Pick **Rename folder** from the menu. The header turns into an inline input — type the new name and press Enter (or click away).

### Adding items directly to a folder

Each folder row has a **+** button next to its more-menu. Click it to create a new endpoint (or type) already inside that folder, skipping the "create at root then drag into folder" two-step. Newly-created folders that don't yet contain anything (pending folders) also get the same + button — clicking it adds the first item and turns the pending folder into a real one.

### Deleting a folder

The more-menu's **Delete folder** item cascades: it removes every endpoint or type inside the folder. A confirm prompt shows the count first (*"Delete folder 'auth' and 5 endpoint(s) inside?"*).

Type folders have an extra guard: if any type inside the folder is referenced from somewhere ELSE in your spec, the delete aborts with a toast listing the offenders. Clean up the references first (or move the type out), then try again.
```

(Adjust phrasing to match the surrounding tone of `folders.md`. If the existing page already has a "Renaming a folder" header, replace its body; otherwise add the heading where the pencil description used to be.)

- [ ] **Step 2: `export-and-curl.md` — add ExportPopover section**

Find a sensible spot AFTER the existing "Export" section (which describes top-bar full-spec export) and BEFORE the "Copy as cURL" section (which describes RunPanel's cURL button). Insert:

```markdown
## Per-endpoint, per-type, per-folder export

The full-spec Export button is great for sharing the whole API. For sharing one endpoint, one type, or one subsystem (folder), the **3-dot menu** on each row opens a dedicated **Export** popover with format tabs:

### Single endpoint

Hover an endpoint row → click ⋯ → pick Export. The popover offers 5 tabs:

- **cURL** — a copy-paste ready command. Path/query/header parameters use `{{name}}` placeholders so the recipient knows what to fill in. The base URL falls back to `{{base-url}}` if your spec doesn't have one set.
- **types.ts** — TypeScript interfaces for all types this endpoint references (transitively).
- **schemas.ts** — Zod schemas for the same closure.
- **client.ts** — a typed client method. Imports from `./types` and `./schemas` (the two tabs above), so all three files compile together.
- **openapi.json** — a valid OpenAPI document containing only this endpoint and its referenced types.

Each tab has Copy + Download buttons.

### Single type

Same menu on any TypePanel row. 3 tabs: TS interface / Zod schema / JSON Schema fragment.

### Folder

The 3-dot menu on a folder row exposes **Export folder**. 4 tabs: `types.ts` / `schemas.ts` / `client.ts` / `openapi.json` covering everything under that folder. Useful for sharing a subsystem of your API ("here's our auth folder").
```

- [ ] **Step 3: `type-builder.md` — add Row affordances section**

Add near the bottom (above any "Related" / "See also" footer):

```markdown
## Row affordances

Each type row in the panel has a **3-dot menu** on the right (visible on hover):

- **Export** — opens the [export popover](/guide/export-and-curl#single-type) for this one type.
- **Duplicate** — clones the type with a `Copy` suffix (`User` → `UserCopy`, then `UserCopy2`, `UserCopy3` if there's a clash). The folder is preserved.
- **Delete** — removes the type. Disabled (with a tooltip explaining why) if the type is referenced anywhere else in the spec; remove the references first.
```

- [ ] **Step 4: Verify VitePress build**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/docs-feature-sweep
pnpm install   # if node_modules empty
pnpm --filter @zwaggen/docs build 2>&1 | tail -20
```

(The exact filter name might be `docs` or `@zwaggen/docs` — check `apps/docs/package.json`.) Green build = no broken links/images.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/guide/folders.md apps/docs/guide/export-and-curl.md apps/docs/guide/type-builder.md
git commit -m "$(cat <<'EOF'
docs(en): sweep folders / export / type-builder for shipped UX

- folders.md: replace pencil-rename description with 3-dot menu
  walkthrough; add sections on the "+ Add endpoint/type" button
  and on the cascade Delete folder behavior with confirm-count.
- export-and-curl.md: add a major section on the per-endpoint /
  per-type / per-folder Export popover (5 / 3 / 4 tabs each, with
  Copy + Download per tab).
- type-builder.md: add a Row affordances section covering Export
  / Duplicate / Delete via the new 3-dot menu.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: High-priority docs rewrites — zh-TW

**Files:**
- Modify: `apps/docs/zh-TW/guide/folders.md`
- Modify: `apps/docs/zh-TW/guide/export-and-curl.md`
- Modify: `apps/docs/zh-TW/guide/type-builder.md`

Mirror the en changes. Read each existing zh-TW page first so the new sections match the tone (the existing translation is human-style, not machine; preserve idiom).

- [ ] **Step 1: Translate the 3 new sections**

Per page:

`folders.md` (zh-TW):
```markdown
### 重新命名資料夾

把游標移到資料夾列上，點右側的 **⋯（更多）** 按鈕，選 **重新命名資料夾**。標題會變成可編輯的輸入框 — 輸入新名字後按 Enter（或點擊別的地方完成）。

### 直接在資料夾裡新增項目

每個資料夾列的更多選單旁邊都有一個 **+** 按鈕。點下去就會直接在這個資料夾裡建立一個新的端點（或型別），不用再「先建立到根目錄、再拖進資料夾」分兩步驟。剛建立但裡面還沒有東西的資料夾（暫存資料夾）也有一樣的 + 按鈕 — 點一下就會放進第一個項目，暫存資料夾也跟著變成正式資料夾。

### 刪除資料夾

更多選單裡的 **刪除資料夾** 是連帶刪除：資料夾內的每個端點或型別都會一起被刪掉。執行前會跳出確認視窗顯示數量（*「刪除資料夾「auth」與其中的 5 個端點？」*）。

型別資料夾還多了一道防呆機制：如果資料夾內的型別有被你 spec 的「其他地方」引用，刪除動作會被中止，並用 toast 列出哪些地方還在用它。先把這些引用清掉（或把型別搬出資料夾），再來重試。
```

`export-and-curl.md` (zh-TW):
```markdown
## 個別端點、個別型別、整個資料夾匯出

上面那個「全 spec Export」很適合分享整份 API。如果只想分享單一端點、單一型別、或整個子系統（資料夾），每個列項旁的 **3 點選單** 都有一個專屬的 **Export** 彈窗，附格式分頁：

### 個別端點

把游標移到端點列 → 點 ⋯ → 選 Export。彈窗會出現 5 個分頁：

- **cURL** — 可以直接複製貼上的指令。Path / query / header 參數用 `{{name}}` 當佔位符，提醒接收者該填什麼。如果 spec 沒設 base URL，URL 部分會用 `{{base-url}}` 取代。
- **types.ts** — 這個端點所有引用到的型別（含遞迴的）對應的 TypeScript interface。
- **schemas.ts** — 同樣那組型別的 Zod schema。
- **client.ts** — 帶型別的 client 方法。會 import `./types` 跟 `./schemas`（前面兩個分頁），所以這三個檔案放一起就能編譯。
- **openapi.json** — 一份合法的 OpenAPI 文件，只包含這個端點與它引用到的型別。

每個分頁都有 Copy + Download 按鈕。

### 個別型別

TypePanel 的列項用同一個選單。3 個分頁：TS interface / Zod schema / JSON Schema 片段。

### 資料夾

資料夾列的 3 點選單裡會看到 **Export folder**。4 個分頁：`types.ts` / `schemas.ts` / `client.ts` / `openapi.json`，涵蓋資料夾底下所有東西。適合分享 API 的某個子系統（「這是我們的 auth 資料夾」）。
```

`type-builder.md` (zh-TW):
```markdown
## 列項操作

TypePanel 的每個型別列右側都有一個 **3 點選單**（游標移上去才會出現）：

- **Export** — 打開[匯出彈窗](/zh-TW/guide/export-and-curl#個別型別)，只匯出這個型別。
- **Duplicate** — 複製這個型別，名字加上 `Copy` 後綴（`User` → `UserCopy`，再來是 `UserCopy2`、`UserCopy3` …）。資料夾位置會保留。
- **Delete** — 刪除這個型別。如果這個型別在 spec 的其他地方還有被引用，按鈕會 disabled（tooltip 會說明原因）— 先把引用清掉再刪。
```

(Adapt the actual "Renaming a folder" / "Row affordances" header in each page if the existing one has slightly different wording — match what's already there. The above is a starting draft.)

- [ ] **Step 2: Verify**

```bash
pnpm --filter @zwaggen/docs build 2>&1 | tail -10
```

Green.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/zh-TW/guide/folders.md apps/docs/zh-TW/guide/export-and-curl.md apps/docs/zh-TW/guide/type-builder.md
git commit -m "$(cat <<'EOF'
docs(zh-TW): mirror en sweep — folders / export / type-builder

zh-TW translations of the new sections from the previous commit.
Tone matches the existing zh-TW translation (human-style, not
machine).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Light-touch docs — endpoints / introduction / codegen (en + zh-TW)

**Files:**
- Modify: `apps/docs/guide/endpoints.md` + `apps/docs/zh-TW/guide/endpoints.md` — mention the 3-dot menu in the EndpointEditor header.
- Modify: `apps/docs/introduction.md` + `apps/docs/zh-TW/introduction.md` — add a feature-highlight bullet about per-slice export.
- Modify: `apps/docs/guide/codegen.md` + `apps/docs/zh-TW/guide/codegen.md` — note the in-app Live preview panel as an alternative to the `--watch` CLI flag.

- [ ] **Step 1: `endpoints.md`**

Add (en) under the EndpointEditor header walkthrough:

> The header's **3-dot menu** (top right) has Export / Duplicate / Delete. Export opens the [per-endpoint export popover](/guide/export-and-curl#single-endpoint).

(zh-TW counterpart: 標題右上的 **3 點選單** 有 Export / Duplicate / Delete。Export 會打開[個別端點的匯出彈窗](/zh-TW/guide/export-and-curl#個別端點)。)

- [ ] **Step 2: `introduction.md`**

Add a bullet to the feature-highlights list:

> - **Export any slice as code** — single endpoint, single type, or a whole folder, as cURL / TypeScript types / Zod schemas / typed client / OpenAPI snippet. No CLI required.

(zh-TW: **將任何片段匯出為程式碼** — 單一端點、單一型別、或整個資料夾，可選 cURL / TypeScript 型別 / Zod schema / 帶型別的 client / OpenAPI 片段。完全不用打開 CLI。)

- [ ] **Step 3: `codegen.md`**

Add at the end of the intro section (or under any "Related" subheading):

> If you want to see the generated code update as you edit (without running `--watch` in a terminal), the web app has a **Live preview panel** in the top-right toolbar (look for the right-panel icon). It shows TS / Zod / Client / OpenAPI tabs that re-render 300ms after every spec change.

(zh-TW: 如果想邊編輯邊看 codegen 結果（不用在終端機跑 `--watch`），web app 工具列右上有個 **即時預覽面板**（找右側面板的 icon）。它有 TS / Zod / Client / OpenAPI 四個分頁，spec 每次變動後 300ms 內就會重新渲染。)

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter @zwaggen/docs build 2>&1 | tail -5

git add apps/docs/guide/endpoints.md apps/docs/guide/codegen.md apps/docs/introduction.md apps/docs/zh-TW
git commit -m "$(cat <<'EOF'
docs: light touches — endpoints / introduction / codegen mention shipped UX

- endpoints.md (en + zh-TW): mention the 3-dot menu in the editor
  header with cross-link to the export popover.
- introduction.md (en + zh-TW): add a feature highlight about
  per-slice export.
- codegen.md (en + zh-TW): mention the in-app Live preview panel
  as an alternative to the CLI's --watch flag.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: TODO entry + move spec/plan + final smoke

**Files:**
- Modify: `docs/TODO.md` — add screenshot-refresh follow-up entry.
- Move: spec + plan to `done/`.

- [ ] **Step 1: Add screenshot-refresh TODO**

Find the "Follow-up from shipped work" section. Append:

```
- [ ] Tutorial docs screenshots refresh — `endpoint-editor.png`, `type-builder-overview.png`, `quickstart-{type-builder,endpoint,response}.png` show pre-3-dot-menu UX. Re-run `SCREENSHOTS=1 pnpm --filter web e2e:screenshots`. Surfaced from `docs/plans/done/2026-04-28-docs-feature-sweep.md`.
```

Update "Last updated" stamp to `2026-04-28 (docs-feature-sweep)`.

- [ ] **Step 2: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-28-docs-feature-sweep.md docs/specs/done/
git mv docs/plans/active/2026-04-28-docs-feature-sweep.md docs/plans/done/
```

- [ ] **Step 3: Final smoke**

```bash
pnpm --filter @zwaggen/docs build
```

Green. (No need to re-run web/cli — this slice is docs-only.)

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship docs-feature-sweep — TODO entry, move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- 3 high-impact en pages updated (folders / export-and-curl / type-builder).
- 3 zh-TW counterparts mirror the en changes.
- 3 light-touch pages × 2 locales = 6 files updated.
- Total: 12 file edits across `apps/docs/`.
- 1 new TODO entry for screenshot refresh.
- VitePress build green.
- Spec + plan moved to `done/`.
- Branch `plan/docs-feature-sweep` ready to push (rebased onto Slice 1's HEAD so the open PR for Slice 1 can land first; this branch's history is linear on top).

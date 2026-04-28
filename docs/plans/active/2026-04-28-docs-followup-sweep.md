# Docs follow-up sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch the user-facing tutorial docs up to three features shipped after the previous sweep:
- Markdown tab in per-endpoint Export popover (#34)
- Bundle export folder-split (#35)
- Folder row "+ folder" button (#36)

**Architecture:** Pure markdown editing across 4-6 files in `apps/docs/`. No code changes.

**Tech Stack:** Markdown + VitePress.

---

### Spec

See `docs/specs/active/2026-04-28-docs-followup-sweep.md`.

---

### Task 1: en docs — `export-and-curl.md` + `folders.md`

**Files:**
- Modify: `apps/docs/guide/export-and-curl.md` — Markdown tab + bundle folder-split section.
- Modify: `apps/docs/guide/folders.md` — extend "Adding items directly to a folder" section.

- [ ] **Step 1: `export-and-curl.md` — Single endpoint tab list (5 → 6) + new bundle layout subsection**

In the "Single endpoint" sub-section (around line 33), update the count and add a Markdown bullet:

```markdown
Hover an endpoint row → click ⋯ → pick Export. The popover offers 6 tabs:

- **cURL** — a copy-paste ready command. Path/query/header parameters use `{{name}}` placeholders so the recipient knows what to fill in. The base URL falls back to `{{base-url}}` if your spec doesn't have one set.
- **types.ts** — TypeScript interfaces for all types this endpoint references (transitively).
- **schemas.ts** — Zod schemas for the same closure.
- **client.ts** — a typed client method. Imports from `./types` and `./schemas` (the two tabs above), so all three files compile together.
- **Markdown** — a human-readable cheatsheet (Info / Parameters / Success Response / Error Response, with parameter tables and JSON examples). Shareable in chat / PR review without recipients needing the spec or any tooling. Filename pattern is `{METHOD}_{path-sanitized}.md` (e.g. `GET_users_id.md`).
- **openapi.json** — a valid OpenAPI document containing only this endpoint and its referenced types.
```

Add a new H3 "Bundle layout — markdown is always folder-split, OpenAPI / JSON Schema can be too" at the end of "Export the spec" section (after "Folders and extends in OpenAPI output"):

```markdown
### Bundle layout — markdown is always folder-split, OpenAPI / JSON Schema can be too

The Export bundle (the zip you download from **Spec Info → Export**) shapes its files like this:

- `spec.zwag` — always at the root.
- **Markdown** — always organized as `markdown/{folder}/{METHOD}_{path}.md`, one file per endpoint. Endpoints with no folder land directly under `markdown/`. Each file is the same per-endpoint cheatsheet you'd get from the Markdown tab in the popover (Info / Parameters / Success Response / Error Response).
- **OpenAPI** — defaults to a single `openapi.{json|yaml}`. Tick the **Split by folder** checkbox in the Export menu to switch to one-file-per-endpoint-folder: `openapi/{folder}.openapi.{json|yaml}`. Each file contains only the endpoints under that folder plus their transitive type closure. Root-level endpoints land at `openapi/_root.openapi.{json|yaml}`.
- **JSON Schema** — same shape: defaults to single `schemas.json`. With **Split by folder** ticked, you get `schemas/{folder}.schemas.json` per endpoint folder.

The full-spec single-file outputs stay unchanged when "Split by folder" is off — the checkbox is purely additive.
```

- [ ] **Step 2: `folders.md` — extend "Adding items directly to a folder"**

Replace the existing single-paragraph section (around line 49-51) with the expanded version:

```markdown
## Adding items directly to a folder

Each folder row's actions cluster (visible on hover) has three buttons, left to right:

- **+ Add endpoint** (or **+ Add type** in TypePanel) — creates a new item already inside this folder.
- **+ folder** — pre-fills the new-folder input with `{parent}/` so you can quickly create a nested subfolder. Type the leaf segment (e.g. `oauth` after `auth/`) and press Enter — `auth/oauth` lands in pending folders.
- **⋯ (more)** — the existing menu (Export folder / Rename folder / Delete folder).

Pending folders also have the **+ Add** button on their row (clicking it both adds the first item and promotes the pending folder to a real one). Pending folders don't yet have the **+ folder** button — once they commit to real, the full action cluster appears.
```

- [ ] **Step 3: VitePress build verification**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/docs-followup-sweep
pnpm install   # if node_modules empty
pnpm --filter docs build 2>&1 | tail -10
```

Watch for broken-link warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/guide/export-and-curl.md apps/docs/guide/folders.md
git commit -m "$(cat <<'EOF'
docs(en): catch up — markdown tab, bundle folder-split, "+ folder" button

- export-and-curl.md: Single endpoint tab list grows from 5 to 6 to
  cover the new Markdown tab. Adds a "Bundle layout" subsection that
  describes markdown's always-folder-split shape and the new
  OpenAPI / JSON Schema "Split by folder" sub-option.
- folders.md: extends "Adding items directly to a folder" to cover
  the new "+ folder" button (creates a nested subfolder pending row
  with the parent path pre-filled).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: zh-TW counterparts

**Files:**
- Modify: `apps/docs/zh-TW/guide/export-and-curl.md`
- Modify: `apps/docs/zh-TW/guide/folders.md`

Mirror Task 1's en changes. Read each existing zh-TW page first to preserve voice (`規格`, `匯出`, `資料夾`, `型別建構器`, etc.).

- [ ] **Step 1: `export-and-curl.md` (zh-TW)** — translate the new Markdown bullet + the Bundle layout subsection.

Suggested wording (adapt to match existing tone):

```markdown
把游標移到端點列 → 點 ⋯ → 選 Export。彈窗會出現 6 個分頁：

- **cURL** — 可以直接複製貼上的指令。Path / query / header 參數用 `{{name}}` 當佔位符，提醒接收者該填什麼。如果 spec 沒設 base URL，URL 部分會用 `{{base-url}}` 取代。
- **types.ts** — 這個端點所有引用到的型別（含遞迴的）對應的 TypeScript interface。
- **schemas.ts** — 同樣那組型別的 Zod schema。
- **client.ts** — 帶型別的 client 方法。會 import `./types` 跟 `./schemas`（前面兩個分頁），所以這三個檔案放一起就能編譯。
- **Markdown** — 人類可讀的端點簡介（Info / Parameters / Success Response / Error Response，附參數表格與 JSON 範例）。適合在聊天或 PR 審查時直接分享，對方不需要 spec 也不需要任何工具就能看懂。檔名格式為 `{METHOD}_{path-sanitized}.md`（例如 `GET_users_id.md`）。
- **openapi.json** — 一份合法的 OpenAPI 文件，只包含這個端點與它引用到的型別。
```

```markdown
### Bundle 結構 — markdown 永遠依資料夾分割，OpenAPI / JSON Schema 可以選擇

從 **Spec Info → Export** 下載的 bundle zip 結構如下：

- `spec.zwag` — 永遠放在根目錄。
- **Markdown** — 永遠用 `markdown/{folder}/{METHOD}_{path}.md` 的結構，每個端點一個檔案。沒有資料夾的端點直接放在 `markdown/` 底下。每個檔案的內容就跟你從彈窗 Markdown 分頁拿到的一樣（Info / Parameters / Success Response / Error Response）。
- **OpenAPI** — 預設是單一 `openapi.{json|yaml}`。在 Export 選單裡勾選 **依資料夾分割**，就會切成一個資料夾一個檔案：`openapi/{folder}.openapi.{json|yaml}`。每個檔案只包含這個資料夾底下的端點，加上它們遞迴引用到的型別。根層級的端點會落在 `openapi/_root.openapi.{json|yaml}`。
- **JSON Schema** — 一樣的結構：預設是單一 `schemas.json`。勾選 **依資料夾分割** 後，會變成 `schemas/{folder}.schemas.json` 一個資料夾一個檔。

「依資料夾分割」沒勾的時候，全 spec 單檔輸出維持不變 — 這個勾選只是附加選項。
```

- [ ] **Step 2: `folders.md` (zh-TW)** — translate the extended "Adding items" section.

```markdown
## 直接在資料夾裡新增項目

每個資料夾列的操作群組（游標移上去才會出現）由左到右有三個按鈕：

- **+ Add endpoint**（在 TypePanel 是 **+ Add type**） — 直接在這個資料夾裡建立一個新項目。
- **+ folder** — 預先把新資料夾輸入框填入 `{parent}/`，方便你建立巢狀子資料夾。輸入葉節點名稱（例如在 `auth/` 後面接 `oauth`），按 Enter — `auth/oauth` 就會出現在暫存資料夾。
- **⋯（更多）** — 既有的選單（匯出資料夾 / 重新命名資料夾 / 刪除資料夾）。

暫存資料夾的列上也有 **+ Add** 按鈕（點下去會同時放入第一個項目，並把暫存資料夾轉成正式資料夾）。暫存資料夾還沒有 **+ folder** 按鈕 — 等它變成正式資料夾後，三個按鈕的完整操作群組才會出現。
```

- [ ] **Step 3: Verify VitePress build**

```bash
pnpm --filter docs build 2>&1 | tail -10
```

Green.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/zh-TW/guide/export-and-curl.md apps/docs/zh-TW/guide/folders.md
git commit -m "$(cat <<'EOF'
docs(zh-TW): mirror en sweep — markdown tab, bundle layout, "+ folder"

zh-TW translations of the new sections from the previous commit.
Tone matches the existing zh-TW translation (規格, 匯出, 資料夾,
型別建構器).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move spec/plan + final smoke

- [ ] **Step 1: Move + smoke**

```bash
git mv docs/specs/active/2026-04-28-docs-followup-sweep.md docs/specs/done/
git mv docs/plans/active/2026-04-28-docs-followup-sweep.md docs/plans/done/
pnpm --filter docs build 2>&1 | tail -3
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: ship docs-followup-sweep — move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- 4 doc files updated (export-and-curl + folders, en + zh-TW).
- New bundle-layout subsection covers markdown / openapi / jsonschema split behaviors.
- "Adding items directly to a folder" section now describes 3 buttons in the action cluster.
- VitePress build green; cross-links resolve.
- Spec + plan moved to `done/`.
- Branch `plan/docs-followup-sweep` ready to push.

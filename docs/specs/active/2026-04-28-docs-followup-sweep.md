# Spec — Docs follow-up sweep (Markdown tab + bundle folder-split + "+ folder")

## Problem

Three features have shipped since the last `docs-feature-sweep` (#33):
- **#34** — Markdown tab in per-endpoint Export popover
- **#35** — Bundle export now folder-splits Markdown always; OpenAPI + JSON Schema gain a "Split by folder" checkbox
- **#36** — "+ folder" button on every folder row (creates a nested subfolder pending entry)

The user wants to release a new version, so the docs site needs to catch up before that ships.

## Success criteria

### `docs/guide/export-and-curl.md` (en + zh-TW)

- The "Single endpoint" sub-section's tab list grows from 5 to 6 — add a `markdown` bullet between `client.ts` and `openapi.json`. Briefly mention the cheatsheet shape (Info / Parameters / Success Response / Error Response with tables and examples).
- New sub-section under "Export the spec" describing the bundle's folder-split behavior:
  - Markdown is always folder-split — explain `markdown/{folder}/{METHOD}_{path}.md` shape
  - OpenAPI + JSON Schema gain a "Split by folder" checkbox — when on, files land at `openapi/{folder}.openapi.{json|yaml}` / `schemas/{folder}.schemas.json` per endpoint folder
  - Root-level (no folder) endpoints/types use `_root` prefix
- Filename mention should reflect new `.zwag` canonical (already done in earlier sweep — verify no stale `.zwag.json` in this page).

### `docs/guide/folders.md` (en + zh-TW)

- Update the "Adding items directly to a folder" section to also describe the new "+ folder" button (sits between the existing `+ Add` button and the ⋯ menu; click pre-fills the new-folder input with `{parent}/`).

### Subtle UX changes worth a one-liner

- **Toasts replace alerts** for save failures + the download-blob hint. Probably worth a single line in `docs/guide/openapi-import.md` near the existing Save-As mention. Skim and decide.
- **`beforeunload` prompt** when leaving with unsaved edits — the browser shows its standard "Leave site?" prompt. Worth a sentence under "Saving" if there's such a section; otherwise skip (the prompt is self-explanatory and standard).

### Tests / verification

- VitePress build (`pnpm --filter docs build`) green; no broken links/anchors.

## Out of scope

- **Screenshot regeneration** — same answer as last sweep. The TODO entry from `docs-feature-sweep` is still open; this sweep doesn't add new screenshots.
- **Quickstart / introduction rewrite** — text remains substantively correct; deferring to a future onboarding pass.
- **A new dedicated page** for the bundle export options. Inlining into `export-and-curl.md` keeps navigation tight.

## Approach

### `export-and-curl.md` — Markdown tab + bundle folder-split section

For the "Single endpoint" tab list, change the count and add the markdown bullet:

```diff
-Hover an endpoint row → click ⋯ → pick Export. The popover offers 5 tabs:
+Hover an endpoint row → click ⋯ → pick Export. The popover offers 6 tabs:

 - **cURL** — a copy-paste ready command. Path/query/header parameters use `{{name}}` placeholders so the recipient knows what to fill in. The base URL falls back to `{{base-url}}` if your spec doesn't have one set.
 - **types.ts** — TypeScript interfaces for all types this endpoint references (transitively).
 - **schemas.ts** — Zod schemas for the same closure.
 - **client.ts** — a typed client method. Imports from `./types` and `./schemas` (the two tabs above), so all three files compile together.
+- **Markdown** — a human-readable cheatsheet (Info / Parameters / Success Response / Error Response, with parameter tables and JSON examples). Shareable in chat / PR review without recipients needing the spec or any tooling. Filename pattern is `{METHOD}_{path-sanitized}.md` (e.g. `GET_users_id.md`).
 - **openapi.json** — a valid OpenAPI document containing only this endpoint and its referenced types.
```

For the bundle section, add a new sub-section after "Folders and extends in OpenAPI output" (before "Per-endpoint, per-type, per-folder export"):

```markdown
### Bundle layout — markdown is always folder-split, OpenAPI / JSON Schema can be too

The Export bundle (the zip you download from **Spec Info → Export**) shapes its files like this:

- `spec.zwag` — always at the root.
- **Markdown** — always organized as `markdown/{folder}/{METHOD}_{path}.md`, one file per endpoint. Endpoints with no folder land directly under `markdown/`. Each file is the same per-endpoint cheatsheet you'd get from the Markdown tab in the popover (Info / Parameters / Success Response / Error Response).
- **OpenAPI** — defaults to a single `openapi.{json|yaml}`. Tick the **Split by folder** checkbox in the Export menu to switch to one-file-per-endpoint-folder: `openapi/{folder}.openapi.{json|yaml}`. Each file contains only the endpoints under that folder plus their transitive type closure. Root-level endpoints land at `openapi/_root.openapi.{json|yaml}`.
- **JSON Schema** — same shape: defaults to single `schemas.json`. With **Split by folder** ticked, you get `schemas/{folder}.schemas.json` per endpoint folder.

The full-spec single-file outputs stay unchanged when "Split by folder" is off — the checkbox is purely additive.
```

(Adapt phrasing to match the existing tone of the page.)

### `folders.md` — extend the "Adding items" section

```diff
 ## Adding items directly to a folder

-Each folder row has a **+** button next to its more-menu. Click it to create a new endpoint (or type) already inside that folder, skipping the "create at root then drag into folder" two-step. Newly-created folders that don't yet contain anything (pending folders) also get the same + button — clicking it adds the first item and turns the pending folder into a real one.
+Each folder row's actions cluster (visible on hover) has three buttons, left to right:
+
+- **+ Add endpoint** (or **+ Add type** in TypePanel) — creates a new item already inside this folder.
+- **+ folder** — pre-fills the new-folder input with `{parent}/` so you can quickly create a nested subfolder. Type the leaf segment (e.g. `oauth` after `auth/`) and press Enter — `auth/oauth` lands in pending folders. (Drag an item in to materialize it; or, more often, use the **+ Add** button on the new pending row to seed it.)
+- **⋯ (more)** — the existing menu (Export folder / Rename folder / Delete folder).
+
+Pending folders also have the **+ Add** button on their row (clicking it both adds the first item and promotes the pending folder to a real one). Pending folders don't yet have the **+ folder** button — once they commit to real, the full action cluster appears.
```

### Subtle mentions (light touches)

In `docs/guide/openapi-import.md`'s save-related sentence (line ~51), if it mentions an alert/dialog on failure, swap to "toast notification". If no such mention exists, skip.

In `docs/guide/openapi-import.md` or `docs/guide/core-concepts.md`, add a one-line note about beforeunload IF there's a relevant Saving section. Otherwise skip — the prompt is standard browser UX.

### zh-TW counterparts

Mirror each en change. Match the existing translation tone (use `規格` for "spec", `型別建構器` for TypePanel, `匯出` for export, `資料夾` for folder, etc.).

### Risks

- **Section anchor changes** — adding a new sub-section heading shifts anchor link slugs in the page TOC. Verify VitePress build doesn't surface broken links from other pages cross-linking to the changed page (e.g. `/guide/export-and-curl#single-endpoint` should still resolve).
- **Tone drift in zh-TW** — read the existing zh-TW page first, match phrasing.

## Done definition

- 4-6 doc files updated (en + zh-TW for each touched page).
- VitePress build green.
- Spec + plan moved to `done/`.
- Branch `plan/docs-followup-sweep` pushed.

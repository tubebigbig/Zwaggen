# Spec — Docs sweep for recently shipped features (Slice 2)

## Problem

The `apps/docs/` user-facing tutorial site is out of sync with several major UX features shipped in the last week:

1. **3-dot OverflowMenu** on every endpoint/type row + folder row + EndpointEditor header — replaces standalone delete buttons. Items: Export / Duplicate / Delete on rows; Export folder / Rename folder / Delete folder on folder rows.
2. **ExportPopover modal** — opens from the menu's "Export" item. Per-endpoint = 5 tabs (cURL with placeholder inputs / types.ts / schemas.ts / client.ts / openapi.json). Per-type = 3 tabs (TS interface / Zod schema / JSON Schema fragment). Per-folder = 4 tabs (types.ts / schemas.ts / client.ts / openapi.json). Each tab has Copy + Download.
3. **LivePreviewPanel** — toggleable right-side panel showing full-spec generated TS/Zod/Client/OpenAPI, debounced as the spec changes. Toggle button in AppHeader.
4. **Folder row "+ Add" button** — left of the 3-dot menu on folder + pending-folder rows. Click creates a new endpoint/type already inside that folder.
5. **Duplicate menu item** — endpoints get a fresh UUID; types use a `Copy` suffix.
6. **Delete folder cascade** — confirm prompt with count; type-folder variant aborts via toast if any in-folder type is referenced from outside.
7. **Toast notifications** + **beforeunload** confirm — replace `alert()`s and protect against tab-close data loss.

Per the explore audit, the top 3 most-stale pages are `folders.md`, `export-and-curl.md`, `type-builder.md`. Three more pages need light touches: `endpoints.md`, `introduction.md`, `codegen.md`. Both en + zh-TW.

## Success criteria

- `apps/docs/guide/folders.md` (en + zh-TW): rename-pencil description replaced with 3-dot menu walkthrough; add a section on the "+ Add endpoint/type" button on folder + pending-folder rows; add a section on Delete folder cascade with the confirm-count prompt + the in-use guard for type folders.
- `apps/docs/guide/export-and-curl.md` (en + zh-TW): add a major section on the new ExportPopover (per-endpoint / per-type / per-folder scopes, format tabs, Copy + Download). Existing top-bar full-spec Export section stays.
- `apps/docs/guide/type-builder.md` (en + zh-TW): add a section on row-level affordances (3-dot menu's Export / Duplicate / Delete + the in-use guard).
- `apps/docs/guide/endpoints.md` (en + zh-TW): mention the 3-dot menu in the EndpointEditor header (replaces the trash button); briefly cross-link to Export.
- `apps/docs/introduction.md` (en + zh-TW): add 1-2 lines under the feature highlights about "Export single endpoints as cURL or generated client/types code" — a workflow advantage worth surfacing.
- `apps/docs/guide/codegen.md` (en + zh-TW): add a short note that an in-app **Live preview panel** mirrors `zwag generate ts/zod/client` for real-time iteration without the CLI.
- All filename mentions consistent with `.zwag.json` (Slice 1 already swept).
- VitePress sidebar / TOC — no new pages added; only existing pages edited. Sidebar config unchanged.
- Manual: confirm `pnpm --filter docs build` (or whatever the docs build command is) succeeds.

## Out of scope

- **Screenshot regeneration**. The audit flagged 4 stale screenshots (`endpoint-editor.png`, `type-builder-overview.png`, `quickstart-{type-builder,endpoint,response}.png`). Re-capturing requires running `SCREENSHOTS=1 pnpm --filter web e2e:screenshots`, which is a separate ~hour-long task with its own setup. Defer to a follow-up TODO entry.
- **`quickstart.md` rewrite** — text is still substantively correct (create type → create endpoint → run); only screenshots show outdated UI. Skip prose edits to avoid touching every visual reference. (Add the screenshot-refresh TODO entry as part of this slice's wrap.)
- **Adding a brand-new page** for ExportPopover or LivePreviewPanel. The audit recommends extending existing pages instead of creating new sidebar entries. Less navigation churn for users.
- **`type-inheritance.md`, `assertions-and-chaining.md`, `batch-and-history.md`, `cors-proxy.md`, `spec-diff.md`, `openapi-import.md`, `running-requests.md`, `desktop.md`** — audit confirmed these are unchanged or already swept.
- **VitePress search index regeneration** — happens automatically on build.

## Approach

### Section additions per page (sketches; final tone matches surrounding docs)

**`folders.md`** — replace the pencil-rename paragraph with:

> ### Renaming a folder
>
> Hover a folder row and click the **⋯ (more)** button on the right. Pick **Rename folder** from the menu. The header turns into an inline input — type the new name and press Enter (or click away).

Add a new section:

> ### Adding items directly to a folder
>
> Each folder row has a **+** button next to its more-menu. Click it to create a new endpoint (or type) already inside that folder, skipping the "create at root then drag into folder" two-step. Newly-created folders that don't yet contain anything (pending folders) also get the same + button — clicking it adds the first item and turns the pending folder into a real one.

Add a new section:

> ### Deleting a folder
>
> The more-menu's **Delete folder** item cascades: it removes every endpoint or type inside the folder. A confirm prompt shows the count first (*"Delete folder 'auth' and 5 endpoint(s) inside?"*).
>
> Type folders have an extra guard: if any type inside the folder is referenced from somewhere ELSE in your spec, the delete aborts with a toast listing the offenders. Clean up the references first (or move the type out), then try again.

**`export-and-curl.md`** — add a major new section between the existing "Export" and "Copy as cURL" sections:

> ## Per-endpoint, per-type, per-folder export
>
> The full-spec Export button is great for sharing the whole API. For sharing one endpoint, one type, or one subsystem (folder), the **3-dot menu** on each row opens a dedicated **Export** popover with format tabs:
>
> ### Single endpoint
>
> Hover an endpoint row → click ⋯ → pick Export. The popover offers 5 tabs:
>
> - **cURL** — a copy-paste ready command. Path/query/header parameters use `{{name}}` placeholders so the recipient knows what to fill in. The base URL falls back to `{{base-url}}` if your spec doesn't have one set.
> - **types.ts** — TypeScript interfaces for all types this endpoint references (transitively).
> - **schemas.ts** — Zod schemas for the same closure.
> - **client.ts** — a typed client method. Uses the imports from `./types` and `./schemas` (the two tabs above), so all three files together compile together.
> - **openapi.json** — a valid OpenAPI document containing only this endpoint and its referenced types.
>
> Each tab has Copy + Download buttons.
>
> ### Single type
>
> Same menu on any TypePanel row. 3 tabs: TS interface / Zod schema / JSON Schema fragment.
>
> ### Folder
>
> The 3-dot menu on a folder row exposes **Export folder**. 4 tabs: `types.ts` / `schemas.ts` / `client.ts` / `openapi.json` covering everything under that folder. Useful for sharing a subsystem of your API ("here's our auth folder").

**`type-builder.md`** — add a new section near the bottom:

> ## Row affordances
>
> Each type row in the panel has a **3-dot menu** on the right (visible on hover):
>
> - **Export** — opens the [export popover](/guide/export-and-curl#single-type) for this one type.
> - **Duplicate** — clones the type with a `Copy` suffix (`User` → `UserCopy`, then `UserCopy2`, `UserCopy3` if there's a clash). The folder is preserved.
> - **Delete** — removes the type. Disabled (with a tooltip explaining why) if the type is referenced anywhere else in the spec; remove the references first.

**`endpoints.md`** — under the existing header walkthrough, add:

> The header's **3-dot menu** (top right) has Export / Duplicate / Delete. Export opens the [per-endpoint export popover](/guide/export-and-curl#single-endpoint).

**`introduction.md`** — under "What does Zwaggen do" (or similar feature-highlights section), add a bullet:

> - **Export any slice as code** — single endpoint, single type, or a whole folder, as cURL / TypeScript types / Zod schemas / typed client / OpenAPI snippet. No CLI required.

**`codegen.md`** — add at the end of the intro section:

> If you want to see the generated code update as you edit (without running `--watch` in a terminal), the web app has a **Live preview panel** in the top-right toolbar (look for the right-panel icon). It shows TS / Zod / Client / OpenAPI tabs that re-render 300ms after every spec change.

### zh-TW counterparts

Same content translated. Match the tone of surrounding paragraphs (the existing zh-TW translation is human-style — keep that voice).

### TODO entry — screenshots refresh

Add to `docs/TODO.md` under the docs-related section:

> - [ ] Tutorial docs screenshots refresh — `endpoint-editor.png`, `type-builder-overview.png`, `quickstart-{type-builder,endpoint,response}.png` show pre-3-dot-menu UX. Re-run `SCREENSHOTS=1 pnpm --filter web e2e:screenshots`. Surfaced from `docs/plans/done/2026-04-28-docs-feature-sweep.md`.

### Verification

- `pnpm --filter @zwaggen/docs build` (or `pnpm --filter docs build` — verify the workspace name) succeeds without broken-link warnings.
- Manually skim each edited page for tone + cross-links.

### Risks

- **Cross-link slugs** in the suggested anchors (`#single-type`, `#single-endpoint`) may not match actual heading slugs VitePress generates. Verify after build (broken anchor links are silent in markdown).
- **zh-TW translations** — implementer should read the existing translation pattern in each file before drafting new content. Don't machine-translate without reading.

## Done definition

- 6 high-impact files edited (3 en + 3 zh-TW): folders / export-and-curl / type-builder.
- 3 light-touch files edited × 2 locales = 6 files: endpoints / introduction / codegen.
- Total: 12 doc-file edits.
- 1 new TODO entry for screenshot refresh.
- VitePress build green; no broken cross-links surface in the build log.
- Spec + plan moved to `done/`.
- Branch `plan/docs-feature-sweep` pushed.

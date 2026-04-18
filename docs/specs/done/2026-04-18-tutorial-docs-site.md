# Tutorial docs site — VitePress-based user manual

**Status**: draft
**Date**: 2026-04-18
**Area**: new workspace `apps/docs/`; root `package.json`, `pnpm-workspace.yaml`; `docs/TODO.md`

## Problem

Zwaggen has shipped ~13 user-facing features (OpenAPI import, type builder, assertions, response chaining, batch run, spec diff, run history, copy-as-curl, etc.) but no user-facing documentation. The `README.md` only explains how to run the dev server. New users have no way to learn what the app is, what it requires, how to install it, or how to use any specific feature. The internal `docs/` tree contains specs and plans for contributors — not a tutorial for end users.

Users need a documentation site styled like Vue / React / Base-UI: a home page, an "installation + quickstart" on-ramp, and a per-feature guide section they can skim or search.

## Goal

Stand up a VitePress-based documentation site at `apps/docs/`, with 13 guide pages covering every shipped feature, and an incremental authoring pipeline that tracks per-page progress in `docs/TODO.md`. English content is canonical; Traditional Chinese translations fill in over time, with missing pages falling back to English.

Stage 0 (scaffold) is the gating stage: after it lands, every subsequent page is a pure content add with no infrastructure churn.

## Non-goals

- **Not deployed to a public host.** Local `pnpm docs:dev` / `docs:build` only; deployment is a separate TODO follow-up.
- **Not an in-app docs route.** The docs site is a separate workspace, not a `/docs` route inside `apps/web`.
- **No API-reference section.** Neither a spec-file-format reference nor a type-DSL reference. The existing `docs/rules/spec-versioning.md` stays where it is; docs pages cross-link to it when relevant. Revisit only if users ask.
- **No custom theme.** Default VitePress theme with minor CSS tweaks only if needed. No logo work, no typography system.
- **No live playgrounds / embedded app.** Static prose + Mermaid diagrams + screenshots only.
- **No search tuning / Algolia / DocSearch.** Default local search is sufficient.
- **No auto-generated pages** from TypeScript types or OpenAPI. Hand-authored.
- **Not bilingual on day one.** Only homepage + Introduction are translated in Stage 0; other zh-TW pages are TODO rows.
- **No screenshot-every-page mandate.** Screenshots are added selectively where the UI is central; concept pages use Mermaid diagrams instead.
- **No version selector.** Current state only; versioning added later if the app gains breaking changes worth calling out.

## Requirements

### Structural

1. New pnpm workspace at `apps/docs/` with its own `package.json` (private, name `docs`), `tsconfig.json` inheriting `tsconfig.base.json`, and a `.gitignore` for `.vitepress/cache` and `.vitepress/dist`.
2. VitePress 1.x installed as a local devDependency of the `docs` workspace. Mermaid support via `vitepress-plugin-mermaid` (or equivalent; the plan may substitute if a better-maintained option exists at implementation time).
3. Root `package.json` gains:
   - `"docs:dev": "pnpm --filter docs dev"`
   - `"docs:build": "pnpm --filter docs build"`
   - `"docs:preview": "pnpm --filter docs preview"`
4. `pnpm-workspace.yaml` includes `apps/docs`.
5. `apps/docs/` uses VitePress default theme. No custom theme directory unless a minor CSS override is required.

### Content structure

6. 13 guide pages authored in English, organized in the sidebar as:
   - **Getting Started**: Introduction, Installation & Requirements, Quickstart.
   - **Guide**: Core Concepts, Type Builder, Endpoints, Running Requests, Assertions & Response Chaining, Batch Run & History, OpenAPI Import, Spec Diff, Export & Copy as cURL, CORS Proxy.
7. Home page using VitePress hero layout: title "Zwaggen", one-line tagline, two CTAs ("Get Started" → Introduction, "GitHub" → repo), three feature tiles (Typed API spec / Runtime validation / Batch testing).
8. A 404 page (use VitePress default — no custom content required).
9. Top nav: "Guide" (anchors to Introduction), "GitHub" (external link).

### Locales

10. Two locales configured in `.vitepress/config.ts`:
    - `root` (English) served at `/`.
    - `zh-TW` served at `/zh-TW/`.
11. Locale label strings (e.g., "English", "繁體中文") come from VitePress locale config, not translation files.
12. Stage 0 ships a translated zh-TW **homepage only** (`zh-TW/index.md`). Every other zh-TW page is initially absent. The zh-TW Introduction is added later in Stage 14. When a user on `/zh-TW/` navigates to a page that has no zh-TW file yet, they must land on the English page at its English URL rather than a broken `/zh-TW/…` URL — i.e., the sidebar for the zh-TW locale only links to pages that actually exist in zh-TW, plus a visible "more pages only in English" locale-switch hint.
13. Every zh-TW page addition is a discrete TODO checkbox.

### Page content requirements (English canonical)

14. **Introduction** — What Zwaggen is (one paragraph), the Postman + Swagger + Zod analogy, when to use it vs. when not to, a "What's in the rest of the docs" linked overview.
15. **Installation & Requirements** — prerequisites (Node ≥ 20, pnpm), supported browsers (Chromium-based + Firefox current), `pnpm install`, `pnpm dev`, `pnpm build`, optional `npx zwaggen-proxy`. Troubleshooting for common install failures (pnpm not installed, wrong Node version).
16. **Quickstart** — A ~5-minute walkthrough: create a spec, add one type, add one endpoint, run it, read the response & validation result. Uses a concrete example (e.g., `GET /todos/:id` returning a `Todo` object). No screenshots required in Stage 2; screenshots added in a later sweep.
17. **Core Concepts** — Spec → Environments → Types → Endpoints mental model. One Mermaid diagram showing the relationships. Cross-links to each concept's detail page.
18. **Type Builder** — primitives, objects (required vs optional fields), arrays, unions, enums, examples, delete-guard behavior (what happens when you delete a type referenced by an endpoint).
19. **Endpoints** — path, method, path/query/header params, auth config, tags, how tags affect the endpoint list.
20. **Running Requests** — the Run panel, environment switching, reading the Response view, request/response body formatting.
21. **Assertions & Response Chaining** — status/body/header assertions; how to extract a value from one response and reference it in a later request; `{{env.foo}}` vs `{{chain.bar}}` syntax.
22. **Batch Run & History** — the Batch panel, "Run all", Run History drawer, inspecting past runs, clearing history.
23. **OpenAPI Import** — drop an OpenAPI file, what's preserved (paths, operations, schemas, examples), what's lost (`x-*` extensions — linked to the existing TODO item), what to fix up afterwards.
24. **Spec Diff** — how to Compare two spec files, how breaking vs non-breaking changes are classified, when to use it (PR review, pre-release).
25. **Export & Copy as cURL** — exporting the canonical `.zwaggen.json`, copying any request as a curl one-liner, use cases (sharing, CI scripts).
26. **CORS Proxy** — why browsers block cross-origin requests, what `zwaggen-proxy` does, `npx zwaggen-proxy` usage, when you do / don't need it.

### Tracking

27. A single parent row in `docs/TODO.md` under the **Feature** section ("Tutorial docs site (VitePress)") with nested checkboxes for each stage: scaffold, each page, zh-TW homepage, zh-TW Introduction, deploy. Sub-items are added or checked off per commit.
28. This spec file lives at `docs/specs/active/2026-04-18-tutorial-docs-site.md` and moves to `done/` once all English pages land (zh-TW translation completion is not a ship-gate).

## Design

### Workspace layout

```
apps/docs/
  package.json              # name: "docs", private, VitePress devDep
  tsconfig.json             # extends tsconfig.base.json
  .gitignore                # .vitepress/cache, .vitepress/dist
  index.md                  # home page (hero layout)
  introduction.md
  installation.md
  quickstart.md
  guide/
    core-concepts.md
    type-builder.md
    endpoints.md
    running-requests.md
    assertions-and-chaining.md
    batch-and-history.md
    openapi-import.md
    spec-diff.md
    export-and-curl.md
    cors-proxy.md
  zh-TW/
    index.md                # translated home (Stage 0c)
    # introduction.md added in Stage 14
    # other pages added as they are translated; absence is OK
  public/
    # screenshots added per-page later; empty at Stage 0
  .vitepress/
    config.ts               # site config, locales, sidebar, nav, mermaid
```

### `.vitepress/config.ts` shape

```ts
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(defineConfig({
  title: 'Zwaggen',
  description: 'Typed API spec builder + runtime tester',

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [{ text: 'Guide', link: '/introduction' }],
        sidebar: [
          {
            text: 'Getting Started',
            items: [
              { text: 'Introduction', link: '/introduction' },
              { text: 'Installation', link: '/installation' },
              { text: 'Quickstart', link: '/quickstart' },
            ],
          },
          {
            text: 'Guide',
            items: [
              { text: 'Core Concepts', link: '/guide/core-concepts' },
              { text: 'Type Builder', link: '/guide/type-builder' },
              { text: 'Endpoints', link: '/guide/endpoints' },
              { text: 'Running Requests', link: '/guide/running-requests' },
              { text: 'Assertions & Chaining', link: '/guide/assertions-and-chaining' },
              { text: 'Batch & History', link: '/guide/batch-and-history' },
              { text: 'OpenAPI Import', link: '/guide/openapi-import' },
              { text: 'Spec Diff', link: '/guide/spec-diff' },
              { text: 'Export & cURL', link: '/guide/export-and-curl' },
              { text: 'CORS Proxy', link: '/guide/cors-proxy' },
            ],
          },
        ],
      },
    },
    'zh-TW': {
      label: '繁體中文',
      lang: 'zh-TW',
      link: '/zh-TW/',
      themeConfig: {
        nav: [{ text: '指南', link: '/zh-TW/introduction' }],
        sidebar: [
          {
            text: '開始使用',
            items: [{ text: '介紹', link: '/zh-TW/introduction' }],
          },
        ],
      },
    },
  },

  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/…/Zwaggen' }],
    search: { provider: 'local' },
  },
}));
```

The GitHub URL is a placeholder until the implementation plan confirms the canonical repo URL.

The zh-TW sidebar above shows the **target** state (after Stage 14 lands an Introduction translation). At Stage 0b the zh-TW sidebar should only list the homepage; add the Introduction entry in Stage 14 and each subsequent translated page as it lands. Sidebar entries must never link to pages that don't exist in zh-TW.

### Workspace manifest — `apps/docs/package.json`

```json
{
  "name": "docs",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vitepress dev",
    "build": "vitepress build",
    "preview": "vitepress preview"
  },
  "devDependencies": {
    "vitepress": "^1.3.0",
    "vitepress-plugin-mermaid": "^2.0.0",
    "mermaid": "^10.0.0"
  }
}
```

Exact versions resolved at install time.

### Home page — `apps/docs/index.md`

```md
---
layout: home
hero:
  name: Zwaggen
  text: Typed API specs, runtime-tested.
  tagline: Postman + Swagger + Zod in one browser app.
  actions:
    - theme: brand
      text: Get Started
      link: /introduction
    - theme: alt
      text: GitHub
      link: https://github.com/…/Zwaggen
features:
  - title: Typed API spec
    details: Build and version a single spec file covering types, endpoints, and environments.
  - title: Runtime validation
    details: Every response is validated against your spec as you test.
  - title: Batch & chain
    details: Run full suites, chain responses, compare spec revisions.
---
```

### Incremental shipping plan (drives the writing-plans stage)

The implementation plan decomposes into these **commit-sized** jobs, each a row in the final plan:

1. **Stage 0a — Workspace scaffold.** Create `apps/docs/`, register in workspace, add VitePress + Mermaid, `.gitignore`, root scripts. Acceptance: `pnpm docs:dev` boots on a blank-ish site.
2. **Stage 0b — Site shell.** `config.ts` with locales, sidebar skeleton, nav, search, Mermaid plugin. Placeholder home page. Acceptance: sidebar renders all 13 stub pages (each an empty `.md` with just a title), home renders hero, en + zh-TW locale switcher shows in the UI.
3. **Stage 0c — zh-TW seed.** `zh-TW/index.md` (translated hero) only. zh-TW sidebar lists just the homepage at this stage; it grows as Stage 14 and later translations land.
4. **Stage 1 — Introduction (en).**
5. **Stage 2 — Installation (en).**
6. **Stage 3 — Quickstart (en).**
7. **Stage 4 — Core Concepts (en)** with one Mermaid diagram.
8. **Stage 5 — Type Builder (en).**
9. **Stage 6 — Endpoints (en).**
10. **Stage 7 — Running Requests (en).**
11. **Stage 8 — Assertions & Chaining (en).**
12. **Stage 9 — Batch & History (en).**
13. **Stage 10 — OpenAPI Import (en).**
14. **Stage 11 — Spec Diff (en).**
15. **Stage 12 — Export & cURL (en).**
16. **Stage 13 — CORS Proxy (en).**
17. **Stage 14 — zh-TW Introduction (translation).**
18. **Stage 15 — Screenshot sweep.** Pass over every page that has UI-heavy content and add 1–2 annotated screenshots to `public/` + page references.

Further zh-TW translations and deployment are separate TODO rows, out of this plan's scope.

### Screenshot protocol (when we reach Stage 15)

- Screenshots saved to `apps/docs/public/screenshots/<slug>.png`, referenced via `![Alt](/screenshots/<slug>.png)`.
- Captured from the built app (`pnpm --filter web build && pnpm --filter web preview`), not dev mode, so UI is stable.
- Annotated with arrows/labels using a consistent tool (TBD at Stage 15; not needed for scaffold).
- Re-shot when the UI changes meaningfully. Stale-screenshot risk is the main cost; if a page's UI is stable, annotate; if it's in flux, lean on prose.

### `docs/TODO.md` update

Under **Feature**, add:

```md
- [ ] Tutorial docs site (VitePress) — `apps/docs/`
  - [ ] Stage 0a: workspace scaffold
  - [ ] Stage 0b: site shell + sidebar + locales
  - [ ] Stage 0c: zh-TW seed (index + introduction stub)
  - [ ] Stage 1: Introduction (en)
  - [ ] Stage 2: Installation (en)
  - [ ] Stage 3: Quickstart (en)
  - [ ] Stage 4: Core Concepts (en) + diagram
  - [ ] Stage 5: Type Builder (en)
  - [ ] Stage 6: Endpoints (en)
  - [ ] Stage 7: Running Requests (en)
  - [ ] Stage 8: Assertions & Chaining (en)
  - [ ] Stage 9: Batch & History (en)
  - [ ] Stage 10: OpenAPI Import (en)
  - [ ] Stage 11: Spec Diff (en)
  - [ ] Stage 12: Export & cURL (en)
  - [ ] Stage 13: CORS Proxy (en)
  - [ ] Stage 14: zh-TW Introduction
  - [ ] Stage 15: Screenshot sweep
  - [ ] Follow-up: deploy (Vercel / GitHub Pages — pick later)
  - [ ] Follow-up: remaining zh-TW page translations
```

## Testing

Docs is content, not runtime code, so the verification bar is "it builds cleanly and renders" — not unit tests.

### Per-stage acceptance

- **Stage 0a:** `pnpm docs:dev` exits with no errors and serves a page. `pnpm docs:build` produces `.vitepress/dist/` with no warnings about missing files. `pnpm --filter web build` still passes (ensures the new workspace doesn't break the existing app).
- **Stage 0b:** Visit local dev server; confirm sidebar shows all 13 items, each resolves to a (possibly empty) page, locale switcher appears, home renders hero.
- **Stages 1–13:** Each page renders without markdown warnings; all internal links resolve (VitePress surfaces dead-link warnings on build — any such warning fails the stage). Mermaid diagrams render on pages that use them.
- **Stage 14:** zh-TW Introduction page renders; locale switcher on the English Introduction page flips to it.
- **Stage 15:** Every referenced screenshot path exists under `public/screenshots/` and renders in both dev and build.

### Manual "new user" test (end of Stage 3)

After Stages 0 + 1 + 2 + 3 ship, a developer unfamiliar with the repo should be able to:

1. Clone, run `pnpm install`, run `pnpm docs:dev`.
2. Read Installation + Quickstart.
3. Run `pnpm dev` (web app) and follow the Quickstart to create a spec, add a type, add an endpoint, and run it.

If any step blocks them, fix the page before declaring Stage 3 done. This is the only gated "user can complete the journey" check; later stages are per-feature and don't need repeated end-to-end runs.

## Error handling

- **Build failures on missing links:** VitePress by default warns rather than fails on dead links. Set `ignoreDeadLinks: false` in config so broken internal links fail the build — content stages catch them immediately.
- **Mermaid parse errors:** handled by `vitepress-plugin-mermaid`; a malformed diagram fails the build. No special handling beyond "fix the diagram."
- **Locale fallback:** VitePress does not auto-fallback missing localized pages to the root locale. We sidestep this by keeping the zh-TW sidebar in sync with files that actually exist in `zh-TW/` (do not link to pages that have no zh-TW file). The locale switcher on an English page simply doesn't appear (or appears disabled) if no zh-TW counterpart exists. No stub files, no redirects.

## Open questions

None requiring user decision before implementation. Minor choices resolvable during the plan:

- Exact VitePress version (pin to latest 1.x at scaffold time).
- Exact Mermaid integration (prefer `vitepress-plugin-mermaid`; fall back to manual code-block-to-SVG transform if unmaintained).
- GitHub repo URL for nav links (placeholder until the user provides or the plan confirms the remote).

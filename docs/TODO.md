# Zwaggen — TODO

Simple checklist of work not yet done. Future sessions: read this and pick one.

Last updated: 2026-04-18

## Fix

- [ ] React `act(...)` warnings in TypePanel / RunPanel tests
- [ ] Manual UX pass on all shipped plans (real browser)
- [ ] Push local commits to `origin/main`

## Feature

- [ ] CI-mode CLI for batch + diff
- [ ] Saved request presets
- [ ] Per-environment `servers[]`
- [ ] Header capture + JSONPath filter expressions
- [ ] Postman collection import
- [x] Tutorial docs site (VitePress) — `apps/docs/` — all 13 English pages + zh-TW home + zh-TW Introduction shipped; see `docs/plans/done/2026-04-18-tutorial-docs-site.md`
- [ ] Tutorial docs: screenshot sweep — capture ~13 annotated UI screenshots and wire into pages (see plan stage 15)
- [ ] Tutorial docs: deploy (Vercel / GitHub Pages)
- [ ] Tutorial docs: translate remaining zh-TW pages (Installation, Quickstart, Core Concepts, Type Builder, Endpoints, Running Requests, Assertions & Chaining, Batch & History, OpenAPI Import, Spec Diff, Export & cURL, CORS Proxy)

## Follow-up from shipped work

- [ ] Canonical stringify for `schema/diff.ts` type equality
- [ ] "Run all = fresh network calls" toggle in batch runner
- [ ] Preserve `x-*` extensions in OpenAPI importer

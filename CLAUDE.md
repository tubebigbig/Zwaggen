# Zwaggen — Session Start

## First thing every session

Read `docs/TODO.md` and report the open items to the user. Ask which to pick. Do not start implementing until the user chooses.

## Docs layout

- `docs/TODO.md` — checklist of unfinished work across fixes, features, and follow-ups.
- `docs/specs/active/` — in-progress spec docs (one feature per file).
- `docs/specs/done/` — shipped specs.
- `docs/plans/active/` — in-progress implementation plans.
- `docs/plans/done/` — shipped plans.
- `docs/rules/` — project-wide invariants (see `docs/rules/index.md`).

When a TODO item is picked, write its spec under `docs/specs/active/` and plan under `docs/plans/active/`. On ship, move both to `done/` and tick the box in `docs/TODO.md`.

## Workflow conventions

- Execute plans with `superpowers:subagent-driven-development` in a `.worktrees/<plan-name>` worktree on branch `plan/<plan-name>`.
- All git ops for a subagent run inside the worktree — never `cd` to the primary repo for commits.
- Commit per small finished job, not batched.
- Final commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Contributing — PR-based, never push main

- **Never push to `main` directly.** Not locally-FF-merged-then-pushed, not even for doc-only commits.
- Push the feature branch to origin (`git push -u origin plan/<plan-name>`). The user opens a PR on GitHub and handles the merge.
- Local `main` should mirror `origin/main`. If you've accidentally FF-merged a feature branch into local `main` before this rule was understood, ASK before resetting — don't auto-rewrite.
- Releases (npm publish, version bumps, tags) happen on the user's schedule via their existing release flow — not as a side effect of a merge. Don't propose cutting a release after a feature lands unless the user asks.

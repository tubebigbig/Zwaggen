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

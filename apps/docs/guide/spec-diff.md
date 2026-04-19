---
description: Compare two spec revisions and see exactly which changes are breaking and which are additive.
---

# Spec Diff

Compare two `.zwaggen.json` files side-by-side to see what changed and whether it's breaking. Built for PR review.

## How to compare

- Click **Compare** in the top bar.
- Pick the "before" spec file (e.g. the version from `main`).

The diff panel opens. Your current in-app spec is treated as "after"; the file you picked is "before."

## What counts as a change

### Endpoints

Matched by `(method, path)`. Presence changes:

- Only in "before" → **removed** → breaking.
- Only in "after" → **added** → non-breaking.
- In both → **changed**, categorized by detail.

Detail-level breakage (non-exhaustive; the complete list is in `docs/specs/done/2026-04-18-spec-diff.md` in the repo):

- New required param, or an optional param becoming required → breaking.
- Request body added, or its type narrowed → breaking.
- A response type at an existing status changed → breaking.
- New optional param, description change, tags change, new response status → non-breaking.

### Types

Matched by name.

- Type removed *and* referenced by any endpoint → breaking. Unreferenced removal → non-breaking.
- Type added → non-breaking.
- Object: field removed, field added as required, field flipped optional→required, field type changed → breaking. Inverse non-breaking.
- String: enum shrunk, `pattern` added or tightened, `minLength` up / `maxLength` down → breaking.
- Number: `min` up, `max` down, enum shrunk → breaking.

## What you see

![Spec diff dialog showing 2 breaking and 1 non-breaking changes](/screenshots/spec-diff-panel.png)

- Header: "**N breaking, M non-breaking** changes."
- Two sections: **Breaking** (red chips) and **Non-breaking** (slate chips).
- Each row: `[kind]` chip + location (e.g. `POST /users`) + one-line summary.

## What it won't tell you

- Not a full structural diff — whitespace and ordering are ignored.
- No migration guide. It categorizes, it doesn't prescribe fixes.
- Only two specs at a time.
- No git integration — you pick the "before" file yourself.

## Typical use

- **PR review.** Before approving a spec change, compare the PR branch's `.zwaggen.json` against `main`'s. Anything in the red bucket deserves a breaking-change note in the PR body.
- **Pre-release gate.** Compare the about-to-ship spec against the last-released one; if there are breakers, bump the major version of the API.

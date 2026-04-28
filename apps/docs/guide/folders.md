---
description: Group types and endpoints into nested folders. Optional — a spec that never sets a folder renders flat, exactly as before.
---

# Folders

Organize types and endpoints into nested paths so large specs stay navigable. Folders are **opt-in**: a spec without any folder fields renders flat, exactly as it did before this feature existed. The moment you set a folder on one type or endpoint, the sidebar switches to a folder tree automatically.

## Creating a folder

Click the **+ folder** icon in the Types or Endpoints panel title bar. An inline input appears in the list; type a path and press `Enter` to commit.

```
auth/admin
users/internal
payments/v2/webhooks
```

- Separator is `/`. You can nest as deep as you like.
- Segment characters: letters, digits, `_`, `.`, `-`, and spaces. Invalid input is rejected and the input is discarded.
- A freshly-created folder is **pending** — it holds no items yet, so it's not in the spec. Drop at least one type or endpoint into it and the folder becomes real. If you reload before dropping anything in, the pending folder evaporates.

## Drag-and-drop

Both sidebars support drag-and-drop — that's how you move items between folders. Grab a type row (or an endpoint row) and drop it onto a folder header to move it; drop onto the empty space at the top of the list (or onto any root-level row) to move it back to the root. Inbound `$ref`s still resolve. Keyboard-only users can `Tab` to the row, press `Space` (or `Enter`) to grab, use arrow keys to move between folders, press `Space` to drop, or `Escape` to cancel.

## Folder tree in the sidebar

Once any item has a folder set:

- Items **without** a folder render at the top of the list (the virtual root), in alphabetical order.
- Items **with** a folder appear inside a collapsible folder node below, one per path segment. Each folder node shows a chevron, the folder name, and the count of items inside (own + descendants).
- Clicking a folder's chevron collapses/expands it. Collapsed state persists across reloads (stored in UI prefs, not the spec).

A type keyed `auth/User` and an endpoint folded into `auth` render side-by-side inside the same `auth/` folder in their respective panels.

## Renaming a folder

Hover a folder row and click the **⋯ (more)** button on the right. Pick **Rename folder** from the menu. The header turns into an inline input — type the new name and press `Enter` (or click away). The rename rewrites:

- Every type key that starts with the folder path (`auth/User` → `identity/User`).
- Every `RefType.ref` pointing at a moved type (so references stay intact).
- Every endpoint's `folder` field that starts with the folder path.

Inline rename only accepts a single segment — typing a multi-segment path (like `identity/core`) is rejected. If you need to relocate a folder to a different parent, drag each item onto the new parent folder.

Folders disappear when empty: delete the last item in a folder and the folder node vanishes.

## Adding items directly to a folder

Each folder row's actions cluster (visible on hover) has three buttons, left to right:

- **+ Add endpoint** (or **+ Add type** in TypePanel) — creates a new item already inside this folder.
- **+ folder** — pre-fills the new-folder input with `{parent}/` so you can quickly create a nested subfolder. Type the leaf segment (e.g. `oauth` after `auth/`) and press Enter — `auth/oauth` lands in pending folders.
- **⋯ (more)** — the existing menu (Export folder / Rename folder / Delete folder).

Pending folders also have the **+ Add** button on their row (clicking it both adds the first item and promotes the pending folder to a real one). Pending folders don't yet have the **+ folder** button — once they commit to real, the full action cluster appears.

## Deleting a folder

The more-menu's **Delete folder** item cascades: it removes every endpoint or type inside the folder. A confirm prompt shows the count first (*"Delete folder 'auth' and 5 endpoint(s) inside?"*).

Type folders have an extra guard: if any type inside the folder is referenced from somewhere ELSE in your spec, the delete aborts with a toast listing the offenders. Clean up the references first (or move the type out), then try again.

## Same short name in different folders

Folders namespace the short name, so `auth/User` and `admin/User` can coexist as two distinct types. Cross-folder references use the full path:

```
RefType { ref: "auth/User" }
```

Refs without a slash point at root-folder types (`ref: "User"` means the type keyed `User` at the top level, not `auth/User`).

## OpenAPI round-trip

Folders survive export and re-import via a small vendor extension:

- On **export**, each type key is flattened: `auth/User` becomes `components.schemas.auth_User`, with `x-folder: "auth"` as a sibling property. Endpoints with a `folder` set carry `x-folder` on the operation.
- On **import**, any schema with `x-folder` is restored under the folder-qualified key; its `$ref`s are rewritten to match. If a schema has no `x-folder`, it lands at the root.

Foreign OpenAPI files that don't use `x-folder` import cleanly as flat types — you can organize them afterward via **+ folder** and drag-and-drop.

## What folders do NOT do

- **No tags replacement.** Endpoints can still have OpenAPI `tags[]`; folders are orthogonal. If no endpoint has a `folder`, the sidebar still groups by tags (existing behavior).
- **No manual ordering within a folder.** Items inside a folder render alphabetically by short name; there's no per-item position field.
- **No empty folders.** A folder exists only while it has at least one descendant.
- **No cross-spec folders.** Folders are a within-spec organizing tool.

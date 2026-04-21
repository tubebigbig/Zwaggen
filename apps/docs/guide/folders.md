---
description: Group types and endpoints into nested folders. Optional — a spec that never sets a folder renders flat, exactly as before.
---

# Folders

Organize types and endpoints into nested paths so large specs stay navigable. Folders are **opt-in**: a spec without any folder fields renders flat, exactly as it did before this feature existed. The moment you set a folder on one type or endpoint, the sidebar switches to a folder tree automatically.

## Setting a folder

Every type and endpoint editor has a **Folder** input near the top. Type a path and press `Enter` or `Tab` to commit.

```
auth/admin
users/internal
payments/v2/webhooks
```

- Separator is `/`. You can nest as deep as you like.
- Segment characters: letters, digits, `_`, `.`, `-`, and spaces. Invalid input is rejected with an inline error and the value reverts.
- An empty value means "root folder" (the default). Clearing the field removes the `folder` entry from the spec entirely.

Renaming a type moves it within its current folder; renaming a folder (see below) moves every descendant.

## Drag-and-drop

Both sidebars support drag-and-drop as an alternative to the Folder input. Grab a type row (or an endpoint row) and drop it onto a folder header to move it; drop onto the empty space at the top of the list to move it back to the root. The schema updates the same way typing into the Folder input does — inbound `$ref`s still resolve. Keyboard-only users can `Tab` to the row, press `Space` (or `Enter`) to grab, use arrow keys to move between folders, press `Space` to drop, or `Escape` to cancel.

## Folder tree in the sidebar

Once any item has a folder set:

- Items **without** a folder render at the top of the list (the virtual root), in alphabetical order.
- Items **with** a folder appear inside a collapsible folder node below, one per path segment. Each folder node shows a chevron, the folder name, and the count of items inside (own + descendants).
- Clicking a folder's chevron collapses/expands it. Collapsed state persists across reloads (stored in UI prefs, not the spec).

A type keyed `auth/User` and an endpoint folded into `auth` render side-by-side inside the same `auth/` folder in their respective panels.

## Renaming a folder

Hover over a folder node in the sidebar. A small pencil button appears on the right — click it to rename the folder inline. The rename rewrites:

- Every type key that starts with the folder path (`auth/User` → `identity/User`).
- Every `RefType.ref` pointing at a moved type (so references stay intact).
- Every endpoint's `folder` field that starts with the folder path.

Inline rename only accepts a single segment — typing a multi-segment path (like `identity/core`) is rejected. If you need to relocate a folder to a different parent, edit the individual Folder inputs on each item.

Folders disappear when empty: delete the last item in a folder and the folder node vanishes.

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

Foreign OpenAPI files that don't use `x-folder` import cleanly as flat types — you can organize them afterward by editing the Folder input on each one.

## What folders do NOT do

- **No tags replacement.** Endpoints can still have OpenAPI `tags[]`; folders are orthogonal. If no endpoint has a `folder`, the sidebar still groups by tags (existing behavior).
- **No manual ordering within a folder.** Items inside a folder render alphabetically by short name; there's no per-item position field.
- **No empty folders.** A folder exists only while it has at least one descendant.
- **No cross-spec folders.** Folders are a within-spec organizing tool.

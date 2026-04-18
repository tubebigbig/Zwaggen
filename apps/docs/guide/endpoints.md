# Endpoints

An endpoint describes one HTTP operation and the types flowing through it.

![Endpoint editor with query params, header, Bearer auth, and 200 + 400 responses](/screenshots/endpoint-editor.png)

## Method and path

Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

Path segments starting with `:` auto-register as path params. Typing `/users/:id/posts/:postId` creates two path-param rows, each defaulting to `string`.

## Parameters

Four rows in the editor, each a list of `ParamDef { name, required, type, description? }`:

- **Path params** — auto-created from the path; type them as `string`, `integer`, etc.
- **Query params** — appended as `?key=value` at run time.
- **Header params** — request headers you want documented as part of the contract.
- **Cookie params** — stored like headers; sent as `Cookie: …`.

Each param can reference a Type or define an inline type (primitive with constraints).

## Request body

Optional. Any `TypeDef` — usually a `ref` to a named object. The Run panel pre-fills the body from the type's `example` if present (see [Type Builder](/guide/type-builder)).

## Responses

Keyed by status code. A typical REST endpoint defines `200`, `400`, `404`. Each response has a `type` — the body shape the server promises for that status. The runtime validator picks the response type matching the actual status received and validates the body against it. If no response is defined for that status, validation is skipped (and the Run panel surfaces an "unspecified status" warning).

## Auth

Four presets:

- **None** — the request goes out unchanged.
- **Bearer** — an `Authorization: Bearer <token>` header.
- **Basic** — standard HTTP Basic (`username:password` base64-encoded).
- **API key** — header or query parameter with a configurable name and value.

The preset is set per endpoint but overridden per environment: each environment carries its own auth, which wins if set. See [Core Concepts](/guide/core-concepts#environments).

## Tags

Tags group endpoints in the sidebar. An endpoint can carry multiple tags. A sidebar with `users`, `orders`, and `auth` tags collapses the endpoint list into three clickable sections. Type a new tag to create it; the tag index is computed, not separately stored.

## Why we match by method + path, not id

Every endpoint has an internal id, but the id is an implementation detail — it can change between saves. When [Spec Diff](/guide/spec-diff) compares two spec files, it matches endpoints by the pair `(method, path)` so that a renamed id doesn't look like a removed-then-added endpoint.

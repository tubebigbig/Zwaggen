# OpenAPI Import

If you already maintain an OpenAPI document, you can seed a Zwaggen spec from it.

## How to import

- Open **Spec Info** (click the spec title).
- Click **Import OpenAPI**.
- Pick a `.json`, `.yaml`, or `.yml` file. Drag-and-drop also works.

The current spec is replaced. If you want to keep your existing spec, export it first (see [Export & cURL](/guide/export-and-curl)).

## What's preserved

- **Spec title** — from `info.title`.
- **Base URL** — from `servers[0].url`. Only the first server is read; see the limitations below.
- **Paths and operations** — every path + method becomes a Zwaggen endpoint.
- **Parameters** — path / query / header / cookie, with required flags and types.
- **Request bodies** — the first `application/json` content shape becomes the Zwaggen body type.
- **Responses** — each `status` with a JSON schema becomes a typed Zwaggen response.
- **Schemas** — `components.schemas.*` become named types in the spec's type namespace.
- **Tags** — operation `tags[]` transfer; the sidebar groups accordingly.

## What's lost (today)

- `x-*` extensions — dropped during import (tracked as a follow-up TODO in the repo).
- `servers[]` beyond the first — only `servers[0]` becomes the base URL. Per-environment servers is a planned feature.
- `security` schemes beyond bearer / basic / apiKey — mapped when possible, otherwise ignored.
- `callbacks`, `webhooks`, `links` — not represented.
- `discriminator` on unions — the union imports, but the discriminator hint is not stored.
- `allOf` composition — flattened into a merged object (approximate — re-verify fields).
- Non-JSON request/response content types — not imported.

## After importing

Walk the endpoint list. A handful of fix-ups are common:

- **Missing response types** — some OpenAPI docs omit a schema on 2xx responses; add them in the endpoint editor.
- **Wrong required flag** — OpenAPI's `required` lives at the object level, not the field level; the importer translates this correctly in normal cases, but schemas with nested `required` arrays occasionally need a re-check.
- **Refs to deleted schemas** — if the source document has dangling `$ref`s, you'll see the Type Builder's delete-guard errors until you clean them up.

Once the endpoints look right, save the spec (File → Save As) to get a Zwaggen-canonical `.zwaggen.json` you can version in git.

---
description: What Zwaggen is, who it is for, and where it fits next to Postman, Swagger, and Zod.
---

# Introduction

## What is Zwaggen?

- One-line summary: Zwaggen is a browser-based typed-API spec builder and runtime tester.
- Analogy: it combines three familiar tools into one — Postman (send real requests), Swagger/OpenAPI (describe the API), and Zod (validate responses against a typed schema at runtime).
- Key distinction vs Postman: Zwaggen's spec is the source of truth. Every response you get is validated against the types in your spec, so you find drift the moment it happens.
- Key distinction vs Swagger: Zwaggen is interactive — the same file that documents your API is the thing you test it with.
- Key distinction vs Zod: the validator runs in the app, not inside your codebase; you don't write TypeScript to use it.
- **Export any slice as code** — single endpoint, single type, or a whole folder, as cURL / TypeScript types / Zod schemas / typed client / OpenAPI snippet. No CLI required.

## When to use it

- You're designing a new API and want a single file that captures types + endpoints + example requests, versioned in git.
- You want to test the live API against its spec without writing test code.
- You're reviewing an API change and want a breaking/non-breaking diff of two spec revisions.
- You maintain an OpenAPI file and want a faster editor + tester than Swagger UI.

## When to skip it

- You already have a mature Postman workspace and a CI test suite — Zwaggen overlaps both.
- You need contract tests enforced in CI. Zwaggen is interactive today; a CI mode is planned (see the repo TODO).
- You need mocking / stubbing. Zwaggen hits real servers via a CORS proxy; it doesn't fake responses.

## What's in the rest of the docs

- [Installation & Requirements](/installation) — what you need to run Zwaggen locally.
- [Quickstart](/quickstart) — build your first spec in five minutes.
- [Core Concepts](/guide/core-concepts) — the mental model: Spec, Environments, Types, Endpoints.
- Guide pages, one per feature, in the sidebar.

The [CORS Proxy](/guide/cors-proxy) page explains when and why you'll want it. Since v0.2.0 it ships **bundled into `npx @zwaggen/web`** — flip the "Use proxy" toggle on any endpoint, no extra install or terminal needed.

# Quickstart

In five minutes you'll build a Zwaggen spec with one type, one endpoint, and a real request. If you haven't installed yet, start with [Installation](/installation).

## The goal

We'll describe a tiny public API — `GET /todos/1` from [JSONPlaceholder](https://jsonplaceholder.typicode.com) — with a typed `Todo` response, run it, and see runtime validation in action.

## 1. Open the app

```bash
pnpm dev
```

Open the printed URL. You'll see an empty spec with "My API" as the default title.

## 2. Set the base URL

- On the right sidebar (**API Info**), set **Base URL** to `https://jsonplaceholder.typicode.com`.

## 3. Create a `Todo` type

- In the left rail, select **Types**.
- Click **+ Add type**. Name it `Todo`.
- Kind: **object**. Click **+ Add field** four times and fill in:

| Name | Type | Required |
| --- | --- | --- |
| `userId` | integer | ✅ |
| `id` | integer | ✅ |
| `title` | string | ✅ |
| `completed` | boolean | ✅ |

![Todo type with userId, id, title, completed fields](/screenshots/quickstart-type-builder.png)

## 4. Create the endpoint

- In the left rail, select **Endpoints**.
- Click **+ Add endpoint**.
- Method: `GET`, Path: `/todos/1`, Name: `Get todo by id`.
- Expand **Responses** → **200** → **Type**. Pick **Ref** and choose `Todo`.

![Endpoint editor showing GET /todos/1 with 200 → Todo response](/screenshots/quickstart-endpoint.png)

## 5. Run it

- Click the endpoint in the list. The **Run** panel opens on the right.
- Click **Send**.
- In the **Response** tab you should see the JSON body and, above it, a green **type ok** chip — the real response matched your `Todo` type.

![Run panel Response tab with green type ok chip](/screenshots/quickstart-response.png)

## 6. See validation find drift (optional)

- Go back to the `Todo` type and change the `title` field's **Required** to ✅ → already ✅. Instead, change `title`'s **kind** to `integer`.
- Re-run the endpoint. The badge now reads **Invalid**, and the Response tab highlights the field that mismatched. This is what Zwaggen catches that Postman doesn't.

Revert `title` to `string` before moving on.

## Next steps

- [Core Concepts](/guide/core-concepts) — the full mental model (Spec, Environments, Types, Endpoints).
- [Type Builder](/guide/type-builder) — primitives, unions, arrays, references, examples.
- [Assertions & Chaining](/guide/assertions-and-chaining) — status/body assertions, reusing values from one response in the next request.

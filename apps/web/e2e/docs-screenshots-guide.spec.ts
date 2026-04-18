import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared guard so normal `pnpm e2e` runs don't overwrite the committed PNGs.
const shouldCapture = process.env.SCREENSHOTS === '1';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../../docs/public/screenshots');

// ---------------------------------------------------------------------------
// Helpers: build up a small spec with 2-3 types and a handful of endpoints via
// the UI. Every `test` below gets a fresh browser context so each rebuilds
// state from scratch — this keeps tests independent and avoids touching
// IndexedDB across runs.
// ---------------------------------------------------------------------------

async function openTypesPanel(page: Page) {
  await page.getByRole('button', { name: 'Expand Types' }).click();
}

async function closeTypesPanel(page: Page) {
  await page.getByRole('button', { name: 'Close types' }).click();
}

/** Adds a new type with its name committed. Leaves the Types panel open and the
 *  new type selected so fields can be added next.
 *
 *  The Type name input uses React's uncontrolled `defaultValue` pattern, so
 *  rapid-fire addType calls can get tripped up by stale component closures —
 *  the next click may still reference the pre-rename `spec` and setSpec clobbers
 *  the freshly-renamed type. We wait for BOTH the new button to appear AND the
 *  transient "NewType" placeholder to disappear before returning. */
async function addType(page: Page, name: string) {
  const typesDialog = page.getByRole('dialog', { name: 'Types' });
  const beforeCount = await typesDialog.locator('ul > li').count();
  await typesDialog.getByRole('button', { name: 'Add type' }).click();
  await expect.poll(async () => typesDialog.locator('ul > li').count()).toBe(beforeCount + 1);

  const typeNameInput = page.getByLabel('Type name');
  await typeNameInput.fill(name);
  await typeNameInput.press('Tab');

  // Wait for the rename to land (new name in list) AND for any transient
  // "NewType*" placeholder to be gone — otherwise a subsequent addType's
  // onClick closure may still reference the pre-rename spec.
  await expect(typesDialog.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(typesDialog.getByRole('button', { name: /^NewType\d*$/ })).toHaveCount(0);
}

/** Adds a single field on the currently-selected type. `fieldIndex` is the
 *  zero-based index of this field among all fields on the type. `kindSelectIdx`
 *  is the index into `getByLabel('Kind')` — for a root object, field `i`
 *  corresponds to Kind select `i + 1` (root's select is index 0). */
async function addObjectField(page: Page, opts: {
  fieldIndex: number;
  kindSelectIdx: number;
  name: string;
  kind?: string;
}) {
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel(`field name ${opts.fieldIndex}`).fill(opts.name);
  if (opts.kind && opts.kind !== 'string') {
    await page.getByLabel('Kind').nth(opts.kindSelectIdx).selectOption(opts.kind);
  }
}

// ---------------------------------------------------------------------------

test.describe('docs screenshots — guide pages', () => {
  test.skip(!shouldCapture, 'Set SCREENSHOTS=1 to capture guide screenshots');
  test.use({ viewport: { width: 1600, height: 1000 } });

  // -------------------------------------------------------------------------
  // 1. type-builder-overview.png — Types panel open with 2-3 types, one
  //    selected with its fields expanded.
  //    Strategy: add ErrorResponse + User first, then Todo LAST so Todo is the
  //    currently-selected type. This sidesteps the re-select-by-click path
  //    entirely — the Type name input uses React `defaultValue` which doesn't
  //    re-sync when `selected` changes, so explicit re-selection is brittle.
  // -------------------------------------------------------------------------
  test('type builder overview', async ({ page }) => {
    await page.goto('/');
    await openTypesPanel(page);

    // ErrorResponse — 2 fields
    await addType(page, 'ErrorResponse');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'code',    kind: 'integer' });
    await addObjectField(page, { fieldIndex: 1, kindSelectIdx: 2, name: 'message', kind: 'string' });

    // User — 3 fields
    await addType(page, 'User');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'id',    kind: 'integer' });
    await addObjectField(page, { fieldIndex: 1, kindSelectIdx: 2, name: 'name',  kind: 'string' });
    await addObjectField(page, { fieldIndex: 2, kindSelectIdx: 3, name: 'email', kind: 'string' });

    // Todo LAST — stays selected by default.
    await addType(page, 'Todo');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'id',        kind: 'integer' });
    await addObjectField(page, { fieldIndex: 1, kindSelectIdx: 2, name: 'title',     kind: 'string' });
    await addObjectField(page, { fieldIndex: 2, kindSelectIdx: 3, name: 'completed', kind: 'boolean' });

    // Sanity: Todo's three fields visible, expanded.
    await expect(page.getByLabel('field name 0')).toHaveValue('id');
    await expect(page.getByLabel('field name 1')).toHaveValue('title');
    await expect(page.getByLabel('field name 2')).toHaveValue('completed');

    await page.screenshot({
      path: path.join(OUT_DIR, 'type-builder-overview.png'),
      fullPage: false,
    });
  });

  // -------------------------------------------------------------------------
  // 2. endpoint-editor.png — richer endpoint with query params, header param,
  //    Bearer auth, 200 + 400 responses.
  // -------------------------------------------------------------------------
  test('endpoint editor', async ({ page }) => {
    await page.goto('/');

    // Minimal Types: Todo + ErrorResponse so the ref selects resolve.
    await openTypesPanel(page);
    await addType(page, 'Todo');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'id',        kind: 'integer' });
    await addObjectField(page, { fieldIndex: 1, kindSelectIdx: 2, name: 'title',     kind: 'string' });
    await addObjectField(page, { fieldIndex: 2, kindSelectIdx: 3, name: 'completed', kind: 'boolean' });
    await addType(page, 'ErrorResponse');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'code',    kind: 'integer' });
    await addObjectField(page, { fieldIndex: 1, kindSelectIdx: 2, name: 'message', kind: 'string' });
    await closeTypesPanel(page);

    // Endpoint: GET /todos with query + header + Bearer + 200 + 400
    await page.getByRole('button', { name: 'New endpoint' }).click();
    await page.getByLabel('Method').selectOption('GET');
    await page.getByLabel('Path').fill('/todos');

    // Two query params
    const queryCard = page.locator('section.card', { hasText: 'Query params' });
    await queryCard.getByRole('button', { name: /Add param/ }).click();
    await queryCard.getByLabel('Param name').first().fill('limit');
    await queryCard.getByLabel('Kind').first().selectOption('integer');
    await queryCard.getByRole('button', { name: /Add param/ }).click();
    await queryCard.getByLabel('Param name').nth(1).fill('completed');
    await queryCard.getByLabel('Kind').nth(1).selectOption('boolean');

    // One header param
    const headersCard = page.locator('section.card', { hasText: 'Headers' }).first();
    await headersCard.getByRole('button', { name: /Add param/ }).click();
    await headersCard.getByLabel('Param name').first().fill('X-Tenant-Id');

    // Auth — override → Bearer (scope to the endpoint's Auth section, avoiding
    // the sidebar's global Auth controls).
    const mainScope = page.getByRole('main');
    await mainScope.getByRole('radio', { name: 'override', exact: true }).check();
    await mainScope.getByLabel('Auth type').selectOption('bearer');
    await mainScope.getByLabel('Token').fill('{{env.apiToken}}');

    // 200 response → Todo
    await page.getByRole('button', { name: 'Add response' }).click();
    await page.getByLabel('Status').nth(0).fill('200');
    // First Kind select inside responses — select it directly under Responses card
    const responsesCard = page.locator('section.card', { hasText: 'Responses' });
    await responsesCard.getByLabel('Kind').first().selectOption('ref');
    await responsesCard.getByLabel('ref').first().selectOption('Todo');

    // 400 response → ErrorResponse
    await page.getByRole('button', { name: 'Add response' }).click();
    await page.getByLabel('Status').nth(1).fill('400');
    await responsesCard.getByLabel('Kind').nth(1).selectOption('ref');
    await responsesCard.getByLabel('ref').nth(1).selectOption('ErrorResponse');

    // Scroll up to frame method/path/params/auth/responses.
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.screenshot({
      path: path.join(OUT_DIR, 'endpoint-editor.png'),
      fullPage: false,
    });
  });

  // -------------------------------------------------------------------------
  // 3. run-panel-request.png — POST endpoint with headers + body visible in
  //    the Run panel. Also serves as the "request tab" shot.
  // -------------------------------------------------------------------------
  test('run panel request', async ({ page }) => {
    await page.route('https://api.test/users', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 42, name: 'Ada', email: 'ada@example.com' }),
      }),
    );

    await page.goto('/');

    // Type: User (we'll use as requestBody)
    await openTypesPanel(page);
    await addType(page, 'User');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'id',    kind: 'integer' });
    await addObjectField(page, { fieldIndex: 1, kindSelectIdx: 2, name: 'name',  kind: 'string' });
    await addObjectField(page, { fieldIndex: 2, kindSelectIdx: 3, name: 'email', kind: 'string' });
    await closeTypesPanel(page);

    // Endpoint: POST /users with a header param and a body.
    await page.getByRole('button', { name: 'New endpoint' }).click();
    await page.getByLabel('Method').selectOption('POST');
    await page.getByLabel('Path').fill('/users');

    const headersCard = page.locator('section.card', { hasText: 'Headers' }).first();
    await headersCard.getByRole('button', { name: /Add param/ }).click();
    await headersCard.getByLabel('Param name').first().fill('X-Request-Id');

    // Enable body and make it a ref → User.
    await page.getByRole('checkbox', { name: 'has body' }).check();
    const bodyCard = page.locator('section.card', { hasText: 'Request body' });
    await bodyCard.getByLabel('Kind').first().selectOption('ref');
    await bodyCard.getByLabel('ref').first().selectOption('User');

    // 201 response → User
    await page.getByRole('button', { name: 'Add response' }).click();
    await page.getByLabel('Status').nth(0).fill('201');
    const responsesCard = page.locator('section.card', { hasText: 'Responses' });
    await responsesCard.getByLabel('Kind').first().selectOption('ref');
    await responsesCard.getByLabel('ref').first().selectOption('User');

    // Fill in the Run panel — Base URL + header value + body.
    const runBaseUrl = page.locator('input[aria-label="Base URL"]:not([placeholder])');
    await runBaseUrl.fill('https://api.test');
    await page.getByLabel('Headers:X-Request-Id').fill('req-0001');
    await page.getByRole('textbox', { name: 'Body' }).fill('{\n  "id": 42,\n  "name": "Ada",\n  "email": "ada@example.com"\n}');

    // Frame: scroll the Run panel's "Try it" header into view.
    await page.getByRole('heading', { name: 'Try it' }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -60));

    await page.screenshot({
      path: path.join(OUT_DIR, 'run-panel-request.png'),
      fullPage: false,
    });
  });

  // -------------------------------------------------------------------------
  // 4. run-panel-response.png — successful validated response, body + chips
  //    visible. Framed wider than quickstart-response.
  // -------------------------------------------------------------------------
  test('run panel response', async ({ page }) => {
    await page.route('https://api.test/users/42', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'x-request-id': 'srv-0042' },
        body: JSON.stringify({
          id: 42,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        }),
      }),
    );

    await page.goto('/');

    // Build type User.
    await openTypesPanel(page);
    await addType(page, 'User');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'id',    kind: 'integer' });
    await addObjectField(page, { fieldIndex: 1, kindSelectIdx: 2, name: 'name',  kind: 'string' });
    await addObjectField(page, { fieldIndex: 2, kindSelectIdx: 3, name: 'email', kind: 'string' });
    await closeTypesPanel(page);

    // Endpoint: GET /users/42 → User.
    await page.getByRole('button', { name: 'New endpoint' }).click();
    await page.getByLabel('Method').selectOption('GET');
    await page.getByLabel('Path').fill('/users/42');
    await page.getByRole('button', { name: 'Add response' }).click();
    await page.getByLabel('Status').first().fill('200');
    const responsesCard = page.locator('section.card', { hasText: 'Responses' });
    await responsesCard.getByLabel('Kind').first().selectOption('ref');
    await responsesCard.getByLabel('ref').first().selectOption('User');

    // Send.
    const runBaseUrl = page.locator('input[aria-label="Base URL"]:not([placeholder])');
    await runBaseUrl.fill('https://api.test');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    const validationChip = page.getByText('type ok', { exact: false });
    await expect(validationChip).toBeVisible();
    await validationChip.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -200));

    await page.screenshot({
      path: path.join(OUT_DIR, 'run-panel-response.png'),
      fullPage: false,
    });
  });

  // -------------------------------------------------------------------------
  // 5. assertions-tab.png — Assertions section with expectedStatus, latency,
  //    a required header, and a capture row.
  // -------------------------------------------------------------------------
  test('assertions section', async ({ page }) => {
    await page.goto('/');

    // Minimal User type so we can attach a response.
    await openTypesPanel(page);
    await addType(page, 'User');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'token', kind: 'string' });
    await closeTypesPanel(page);

    // Endpoint.
    await page.getByRole('button', { name: 'New endpoint' }).click();
    await page.getByLabel('Method').selectOption('POST');
    await page.getByLabel('Path').fill('/auth/login');
    await page.getByRole('button', { name: 'Add response' }).click();
    await page.getByLabel('Status').first().fill('200');
    const responsesCard = page.locator('section.card', { hasText: 'Responses' });
    await responsesCard.getByLabel('Kind').first().selectOption('ref');
    await responsesCard.getByLabel('ref').first().selectOption('User');

    // Assertions.
    await page.getByLabel('Expected status').fill('200');
    await page.getByLabel('Max latency (ms)').fill('2000');
    await page.getByRole('button', { name: 'Add header' }).click();
    await page.getByLabel('header-name-0').fill('Content-Type');
    await page.getByLabel('header-value-0').fill('application/json');

    // Capture.
    await page.getByRole('button', { name: 'Add capture' }).click();
    await page.getByLabel('capture-path-0').fill('token');
    await page.getByLabel('capture-var-0').fill('authToken');

    // Scroll so the Assertions + Captures sections are in view together.
    await page.getByRole('heading', { name: 'Assertions' }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -40));

    await page.screenshot({
      path: path.join(OUT_DIR, 'assertions-tab.png'),
      fullPage: false,
    });
  });
});

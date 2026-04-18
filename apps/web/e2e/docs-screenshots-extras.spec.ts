import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shouldCapture = process.env.SCREENSHOTS === '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../../docs/public/screenshots');

async function openTypesPanel(page: Page) {
  await page.getByRole('button', { name: 'Expand Types' }).click();
}

async function closeTypesPanel(page: Page) {
  await page.getByRole('button', { name: 'Close types' }).click();
}

async function addType(page: Page, name: string) {
  const typesDialog = page.getByRole('dialog', { name: 'Types' });
  const beforeCount = await typesDialog.locator('ul > li').count();
  await typesDialog.getByRole('button', { name: 'Add type' }).click();
  await expect.poll(async () => typesDialog.locator('ul > li').count()).toBe(beforeCount + 1);
  const typeNameInput = page.getByLabel('Type name');
  await typeNameInput.fill(name);
  await typeNameInput.press('Tab');
  await expect(typesDialog.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(typesDialog.getByRole('button', { name: /^NewType\d*$/ })).toHaveCount(0);
}

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

test.describe('docs screenshots — batch, history, extras', () => {
  test.skip(!shouldCapture, 'Set SCREENSHOTS=1 to capture guide screenshots');
  test.use({ viewport: { width: 1600, height: 1000 } });

  // -------------------------------------------------------------------------
  // 6. batch-panel.png — three endpoints, Batch panel open after a run, with
  //    a "2 passed / 1 failed"-ish summary. The runner fires automatically on
  //    mount, so we just need three endpoints with mocks and wait.
  // -------------------------------------------------------------------------
  test('batch panel', async ({ page }) => {
    await page.route('https://api.test/users', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, name: 'Ada' }) }),
    );
    await page.route('https://api.test/orders', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'o1', total: 100 }) }),
    );
    // Deliberate type-mismatch on the third so we get at least one "failed" row
    // (name is declared string, server returns number).
    await page.route('https://api.test/products', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'p1', name: 123 }) }),
    );

    await page.goto('/');

    const specInfoBaseUrl = page.locator('input[aria-label="Base URL"][placeholder]');
    await specInfoBaseUrl.fill('https://api.test');
    await specInfoBaseUrl.blur();

    // Helper: create a GET endpoint with an inline-object 200 response.
    async function createEndpoint(pth: string, fields: Array<{ name: string; kind: string }>) {
      await page.getByRole('button', { name: 'New endpoint', exact: true }).click();
      const pathInput = page.getByLabel('Path', { exact: true });
      // Wait for the freshly-created endpoint's Path input to settle at the
      // default '/' before we overwrite it.
      await expect(pathInput).toHaveValue('/');
      await pathInput.fill(pth);
      await expect(pathInput).toHaveValue(pth);
      await page.getByRole('button', { name: 'Add response' }).click();
      await page.getByLabel('Status', { exact: true }).fill('200');
      const responsesCard = page.locator('section.card', { hasText: 'Responses' });
      for (let i = 0; i < fields.length; i++) {
        await responsesCard.getByRole('button', { name: 'Add field' }).click();
        await responsesCard.getByLabel(`field name ${i}`).fill(fields[i]!.name);
        if (fields[i]!.kind !== 'string') {
          await responsesCard.getByLabel('Kind').nth(i + 1).selectOption(fields[i]!.kind);
        }
      }
      // Confirm the endpoint ended up in the sidebar before we move on.
      await expect(page.getByRole('button', { name: `GET ${pth}` })).toBeVisible();
    }

    await createEndpoint('/users',    [{ name: 'id', kind: 'integer' }, { name: 'name', kind: 'string' }]);
    await createEndpoint('/orders',   [{ name: 'id', kind: 'string'  }, { name: 'total', kind: 'number' }]);
    await createEndpoint('/products', [{ name: 'id', kind: 'string'  }, { name: 'name',  kind: 'string' }]); // type mismatch

    // The Batch runner re-uses per-endpoint history to issue the same request,
    // so we have to seed history by sending each one once via the Run panel.
    async function seed(endpointLabel: string) {
      await page.getByRole('button', { name: endpointLabel }).click();
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      // Wait for a validation chip (any outcome).
      await expect(page.getByText(/type ok|type errors|no type declared/)).toBeVisible();
    }
    await seed('GET /users');
    await seed('GET /orders');
    await seed('GET /products');

    // Open Batch panel — it auto-runs on mount using the seeded history.
    await page.getByRole('button', { name: 'Run all', exact: true }).click();

    const batchDialog = page.getByRole('dialog', { name: 'Run all' });
    await expect(batchDialog).toBeVisible();

    // Wait until the summary line appears (".../ N" after every row settles).
    await expect(batchDialog.locator('text=/\\d+\\s*\\/\\s*\\d+/')).toBeVisible({ timeout: 15_000 });
    // No row still shows 'sending'.
    await expect
      .poll(async () => batchDialog.getByText('sending').count(), { timeout: 15_000 })
      .toBe(0);

    await page.screenshot({
      path: path.join(OUT_DIR, 'batch-panel.png'),
      fullPage: false,
    });
  });

  // -------------------------------------------------------------------------
  // 7. history-drawer.png — multiple sends on one endpoint with varied status
  //    codes. The "History" drawer is rendered inline at the bottom of the
  //    RunPanel, so we just need to scroll it into view.
  // -------------------------------------------------------------------------
  test('history drawer', async ({ page }) => {
    let hit = 0;
    // Alternate 200 / 400 / 200 / 500 on each call to the same URL.
    const sequence = [200, 400, 200, 500];
    await page.route('https://api.test/flaky', (route) => {
      const status = sequence[hit % sequence.length]!;
      hit += 1;
      const body = status >= 400
        ? { error: 'nope', message: `status ${status}` }
        : { id: hit, ok: true };
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.goto('/');

    await page.getByRole('button', { name: 'New endpoint' }).click();
    await page.getByLabel('Method').selectOption('GET');
    await page.getByLabel('Path').fill('/flaky');
    // No response types declared — we just want history entries. The validator
    // will add "no type declared" chips but the history still logs them.

    const runBaseUrl = page.locator('input[aria-label="Base URL"]:not([placeholder])');
    await runBaseUrl.fill('https://api.test');

    // Fire four sends to stack four history entries with varied statuses.
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByText(/no type declared|type ok|type errors/)).toBeVisible();
      // Wait a tick so the next entry lands with a different timestamp.
      await page.waitForTimeout(200);
    }

    // Scroll the History block into view.
    await page.getByText('History', { exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -60));

    await page.screenshot({
      path: path.join(OUT_DIR, 'history-drawer.png'),
      fullPage: false,
    });
  });

  // -------------------------------------------------------------------------
  // 8. openapi-import.png — capture the AppHeader with the "Import OpenAPI"
  //    button highlighted/visible. The button lives in the top bar so we just
  //    frame the top of the app.
  // -------------------------------------------------------------------------
  test('openapi import affordance', async ({ page }) => {
    await page.goto('/');
    // Hover the button so it shows its hover state — makes the screenshot feel
    // like "this is the thing you click".
    const btn = page.getByRole('button', { name: 'Import OpenAPI' });
    await expect(btn).toBeVisible();
    await btn.hover();
    // Clip to the top bar area.
    await page.screenshot({
      path: path.join(OUT_DIR, 'openapi-import.png'),
      fullPage: false,
      clip: { x: 0, y: 0, width: 1600, height: 80 },
    });
  });

  // -------------------------------------------------------------------------
  // 9. spec-diff-panel.png — build a current spec, then upload a slightly
  //    different "before" spec via the Compare button. Playwright's
  //    FileChooser API handles the dynamic <input type="file"> created by
  //    our `uploadFile()` fallback.
  // -------------------------------------------------------------------------
  test('spec diff panel', async ({ page }) => {
    // Disable the File System Access API so `supportsFileSystemAccess()` returns
    // false and the app falls back to an `<input type="file">` that Playwright
    // can drive via the filechooser event.
    await page.addInitScript(() => {
      // @ts-expect-error — intentionally deleting the property to force fallback.
      delete (window as any).showOpenFilePicker;
      // @ts-expect-error — same for save picker (not used here but defensive).
      delete (window as any).showSaveFilePicker;
    });
    await page.goto('/');

    // Build a current spec with a Todo type and two endpoints.
    await openTypesPanel(page);
    await addType(page, 'Todo');
    await addObjectField(page, { fieldIndex: 0, kindSelectIdx: 1, name: 'id',        kind: 'integer' });
    await addObjectField(page, { fieldIndex: 1, kindSelectIdx: 2, name: 'title',     kind: 'string' });
    await addObjectField(page, { fieldIndex: 2, kindSelectIdx: 3, name: 'completed', kind: 'boolean' });
    // Extra required field on current (vs. base) so we get a breaking change.
    await addObjectField(page, { fieldIndex: 3, kindSelectIdx: 4, name: 'priority',  kind: 'integer' });
    await closeTypesPanel(page);

    await page.getByRole('button', { name: 'New endpoint' }).click();
    await page.getByLabel('Method').selectOption('GET');
    await page.getByLabel('Path').fill('/todos');

    // Add an OPTIONAL query param `limit` — this shows up as a non-breaking
    // change because the before-spec's /todos has no such param.
    const queryCard = page.locator('section.card', { hasText: 'Query params' });
    await queryCard.getByRole('button', { name: /Add param/ }).click();
    await queryCard.getByLabel('Param name').first().fill('limit');
    // Toggle required off — optional query params are additive, i.e. non-breaking.
    await queryCard.locator('label', { hasText: 'required' }).first().click();

    await page.getByRole('button', { name: 'Add response' }).click();
    await page.getByLabel('Status').first().fill('200');
    const responsesCard = page.locator('section.card', { hasText: 'Responses' });
    await responsesCard.getByLabel('Kind').first().selectOption('ref');
    await responsesCard.getByLabel('ref').first().selectOption('Todo');

    // Build the "before" spec JSON — older Todo with no `priority`, and a
    // removed endpoint /admin we still expose here to flag as "only in before".
    const beforeSpec = {
      schemaVersion: 1,
      info: { name: 'demo', baseUrl: '' },
      activeEnvironment: 'default',
      environments: { default: { variables: [] } },
      useProxyDefault: false,
      types: {
        Todo: {
          kind: 'object',
          fields: [
            { name: 'id',        required: true, type: { kind: 'integer' } },
            { name: 'title',     required: true, type: { kind: 'string' } },
            { name: 'completed', required: true, type: { kind: 'boolean' } },
          ],
        },
      },
      endpoints: [
        {
          id: 'old-1',
          method: 'GET', path: '/todos',
          pathParams: [], queryParams: [], headers: [],
          requestBody: null,
          responses: [{ status: 200, type: { kind: 'ref', ref: 'Todo' } }],
          auth: 'inherit', useProxy: 'inherit',
        },
        {
          id: 'old-2',
          method: 'GET', path: '/admin',
          pathParams: [], queryParams: [], headers: [],
          requestBody: null,
          responses: [{ status: 200, type: { kind: 'object', fields: [] } }],
          auth: 'inherit', useProxy: 'inherit',
        },
      ],
    };

    // Click Compare — our uploadFile() fallback will pop an <input type=file>.
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Compare' }).click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'before.zwaggen.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(beforeSpec)),
    });

    // DiffPanel opens. Note: AppHeader uses `backdrop-filter` which creates a
    // containing block, so the DiffPanel's `fixed inset-0` is actually
    // positioned relative to the header, not the viewport. For the screenshot
    // we temporarily strip that filter so the dialog centers in the viewport.
    await page.addStyleTag({ content: `
      header.sticky { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
    `});

    const dialog = page.getByRole('dialog', { name: 'Spec changes' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /^\d+ breaking$/ })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /^\d+ non-breaking$/ })).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2, name: /Spec changes/ })).toBeVisible();

    await page.screenshot({
      path: path.join(OUT_DIR, 'spec-diff-panel.png'),
      fullPage: false,
    });
  });

  // -------------------------------------------------------------------------
  // 10. copy-as-curl.png — Copy as cURL button in the Run panel after a
  //     successful Send, with the "Copied" confirmation visible.
  // -------------------------------------------------------------------------
  test('copy as curl', async ({ page, context }) => {
    // Grant clipboard permissions so `navigator.clipboard.writeText` resolves
    // and the UI shows the "Copied" toast instead of the fallback textarea.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.route('https://api.test/ping', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    );

    await page.goto('/');

    await page.getByRole('button', { name: 'New endpoint' }).click();
    await page.getByLabel('Method').selectOption('GET');
    await page.getByLabel('Path').fill('/ping');

    const runBaseUrl = page.locator('input[aria-label="Base URL"]:not([placeholder])');
    await runBaseUrl.fill('https://api.test');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    // Wait for response state so Copy has sensible inputs.
    await expect(page.getByText(/no type declared|type ok/)).toBeVisible();

    // Click Copy as cURL — transient "Copied" text replaces the label for 1.5s.
    await page.getByRole('button', { name: 'Copy as cURL' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

    // Frame: scroll so the Send + Copy row is visible.
    await page.getByRole('button', { name: 'Copied' }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));

    await page.screenshot({
      path: path.join(OUT_DIR, 'copy-as-curl.png'),
      fullPage: false,
    });
  });
});

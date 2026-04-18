import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guard so normal `pnpm e2e` runs do not overwrite the committed PNGs.
const shouldCapture = process.env.SCREENSHOTS === '1';

// Screenshots land directly in the VitePress public dir so the docs pages
// can reference them as `/screenshots/<slug>.png`.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../../docs/public/screenshots');

test.describe('docs screenshots', () => {
  test.skip(!shouldCapture, 'Set SCREENSHOTS=1 to capture Quickstart screenshots');
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('Quickstart flow', async ({ page }) => {
    // Deterministic mock for the real JSONPlaceholder call.
    await page.route('https://jsonplaceholder.typicode.com/todos/1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 1,
          id: 1,
          title: 'delectus aut autem',
          completed: false,
        }),
      }),
    );

    await page.goto('/');

    // 1. Set base URL via the right-hand "API info" panel (SpecInfoEditor).
    //    Two inputs share aria-label="Base URL"; the SpecInfoEditor one has
    //    a placeholder, the RunPanel one does not.
    const specInfoBaseUrl = page.locator('input[aria-label="Base URL"][placeholder]');
    await specInfoBaseUrl.fill('https://jsonplaceholder.typicode.com');
    await specInfoBaseUrl.blur();

    // 2. Open the Types panel (collapsed by default).
    await page.getByRole('button', { name: 'Expand Types' }).click();

    // 3. Add the Todo type — defaults to object, required-true fields.
    await page.getByRole('button', { name: 'Add type' }).click();
    const typeNameInput = page.getByLabel('Type name');
    await typeNameInput.fill('Todo');
    await typeNameInput.blur();

    // 4. Add four fields. Each Add Field click expands the new row, which
    //    renders a child Kind select so we can change the field's type.
    const fieldSpecs: Array<{ name: string; kind: string }> = [
      { name: 'userId', kind: 'integer' },
      { name: 'id', kind: 'integer' },
      { name: 'title', kind: 'string' },
      { name: 'completed', kind: 'boolean' },
    ];

    for (let i = 0; i < fieldSpecs.length; i++) {
      await page.getByRole('button', { name: 'Add field' }).click();
      const spec = fieldSpecs[i]!;
      await page.getByLabel(`field name ${i}`).fill(spec.name);
      // Kind selects (in order): [0]=Todo's object, [1..4]=each expanded field.
      // String is the default for new fields, so only toggle when needed.
      if (spec.kind !== 'string') {
        await page.getByLabel('Kind').nth(i + 1).selectOption(spec.kind);
      }
    }

    // Sanity check: all four fields present before shooting.
    await expect(page.getByLabel('field name 0')).toHaveValue('userId');
    await expect(page.getByLabel('field name 3')).toHaveValue('completed');

    // SCREENSHOT 1: Types panel with Todo + four fields.
    await page.screenshot({
      path: path.join(OUT_DIR, 'quickstart-type-builder.png'),
      fullPage: false,
    });

    // 5. Close the Types panel.
    await page.getByRole('button', { name: 'Close types' }).click();

    // 6. Create the endpoint: GET /todos/1 with a 200 → Todo response.
    await page.getByRole('button', { name: 'New endpoint' }).click();
    await page.getByLabel('Method').selectOption('GET');
    await page.getByLabel('Path').fill('/todos/1');

    await page.getByRole('button', { name: 'Add response' }).click();
    await page.getByLabel('Status').first().fill('200');
    // Response type Kind — only one Kind select in the endpoint editor until ref chosen.
    await page.getByLabel('Kind').selectOption('ref');
    // RefControls renders a select with aria-label="ref"; default value is Todo.
    await expect(page.getByLabel('ref')).toHaveValue('Todo');

    // SCREENSHOT 2: endpoint editor with GET /todos/1 + 200 → Todo.
    await page.screenshot({
      path: path.join(OUT_DIR, 'quickstart-endpoint.png'),
      fullPage: false,
    });

    // 7. Point the RunPanel at JSONPlaceholder and send. The RunPanel's
    //    Base URL input is the one WITHOUT a placeholder.
    const runBaseUrl = page.locator('input[aria-label="Base URL"]:not([placeholder])');
    await runBaseUrl.fill('https://jsonplaceholder.typicode.com');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    // 8. Wait for the green "type ok" chip that confirms the response
    //    matched the declared Todo type.
    const validationChip = page.getByText('type ok', { exact: false });
    await expect(validationChip).toBeVisible();

    // The Try It / Response section is deep in the page — scroll the chip
    // into view so the screenshot captures both the badge and the body.
    await validationChip.scrollIntoViewIfNeeded();
    // Nudge a little further up so the viewport frames Send button + response.
    await page.evaluate(() => window.scrollBy(0, -120));

    // SCREENSHOT 3: Run panel showing response + green validation chip.
    await page.screenshot({
      path: path.join(OUT_DIR, 'quickstart-response.png'),
      fullPage: false,
    });
  });
});

import { test, expect } from '@playwright/test';

test('create Base + Child extends Base; override a field; child shows override badge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // Open Types panel (starts collapsed).
  await page.getByRole('button', { name: /Expand Types|展開 Types/ }).click();

  // ---- Create Base with one field: id (string) ----
  // Click the "+" button in the types panel header to add a new type (defaults to "NewType").
  await page.getByRole('button', { name: /Add type/i }).click();
  // Wait for NewType to appear in the sidebar so the editor below is mounted.
  await expect(page.locator('[data-type-key="NewType"]')).toBeVisible();

  // Rename NewType → Base via the Type name input.
  const typeNameInput = page.getByLabel('Type name');
  await typeNameInput.fill('Base');
  await typeNameInput.blur();
  await expect(page.locator('[data-type-key="Base"]')).toBeVisible();

  // Select Base to make sure its editor is mounted below (rename reselects to the new key).
  await page.locator('[data-type-key="Base"]').click();

  // Add one field and name it `id`.
  await page.getByRole('button', { name: /Add field/i }).click();
  await page.getByLabel('field name 0').fill('id');

  // ---- Create Child extending Base ----
  await page.getByRole('button', { name: /Add type/i }).click();
  await expect(page.locator('[data-type-key="NewType"]')).toBeVisible();

  // Rename NewType → Child. `getByLabel('Type name')` re-resolves each call.
  const childNameInput = page.getByLabel('Type name');
  await childNameInput.fill('Child');
  await childNameInput.blur();
  await expect(page.locator('[data-type-key="Child"]')).toBeVisible();

  await page.locator('[data-type-key="Child"]').click();

  // Pick Base as the parent via the native <select> in the chip picker.
  await page.locator('select[aria-label="Extends"]').selectOption('Base');

  // Inherited fields panel should now list `id` with an Override button.
  await expect(page.getByRole('button', { name: /^Override id$/i })).toBeVisible();
  await page.getByRole('button', { name: /^Override id$/i }).click();

  // The own field row for `id` now shows the "(override)" badge.
  await expect(page.getByText(/\(override\)/i).first()).toBeVisible();
});

import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Drag `source` onto `target` using explicit pointer steps that clear
 * @dnd-kit/core's 5px activation constraint. Using `locator.dragTo()` alone
 * often drops on the source itself because the intermediate mousemove skips
 * across the target's bounding box too quickly for the sensor to register.
 */
async function dragOnto(page: Page, source: Locator, target: Locator) {
  const srcBox = await source.boundingBox();
  const dstBox = await target.boundingBox();
  if (!srcBox || !dstBox) throw new Error('source or target has no bounding box');
  const sx = srcBox.x + srcBox.width / 2;
  const sy = srcBox.y + srcBox.height / 2;
  const dx = dstBox.x + dstBox.width / 2;
  const dy = dstBox.y + dstBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Small move first to trigger @dnd-kit's activation constraint.
  await page.mouse.move(sx + 8, sy + 8, { steps: 4 });
  // Then glide over to the target in steps so collision detection fires.
  await page.mouse.move(dx, dy, { steps: 12 });
  await page.mouse.up();
}

test.describe('folders', () => {
  test('creating a pending folder and DnD-ing an endpoint into it materializes and persists across reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByRole('button', { name: /New endpoint/i }).click();
    await page.getByRole('button', { name: /^GET \//i }).click();

    // Create a pending folder via the "+ New folder" title button in the endpoints panel.
    const endpointsAside = page.locator('aside:has(h2:has-text("Endpoints"))');
    await endpointsAside.getByRole('button', { name: /^New folder$/ }).click();
    const newFolderInput = endpointsAside.getByRole('textbox', { name: /^New folder$/ });
    await newFolderInput.fill('auth');
    await newFolderInput.press('Enter');

    // Drag the endpoint row onto the pending 'auth' folder.
    const source = endpointsAside.getByRole('button', { name: /^GET \// });
    const target = endpointsAside.locator('[data-pending-folder="auth"]');
    await dragOnto(page, source, target);

    // The folder is now real — it renders as a toggle button with a rename pencil.
    await expect(page.getByRole('button', { name: /^auth\b/i }).first()).toBeVisible({ timeout: 5000 });

    // Reload; the draft store should reopen with the tree intact.
    await page.reload();
    await expect(page.getByRole('button', { name: /^auth\b/i }).first()).toBeVisible();
  });

  test('renaming a type folder moves every descendant and updates refs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Open the types panel (CollapsedRail on the left).
    await page.getByRole('button', { name: /Expand Types|展開 Types/ }).click();
    // Seed: create a type inside an 'auth' folder via + folder + DnD.
    await addTypeWithFolder(page, 'Session', 'auth');

    // Rename the folder via the pencil (Rename folder) icon button.
    await page.getByRole('button', { name: /Rename folder/i }).first().click();
    const renameInput = page.getByRole('textbox', { name: /Rename folder/i });
    await renameInput.fill('identity');
    await renameInput.press('Enter');

    await expect(page.getByRole('button', { name: /^auth\b/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^identity\b/i }).first()).toBeVisible();
  });

  test('DnD: dragging a type row onto a different folder header moves it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByRole('button', { name: /Expand Types|展開 Types/ }).click();
    await addTypeWithFolder(page, 'Alpha', 'auth');
    await addTypeWithFolder(page, 'Beta', 'billing');

    await expect(page.getByRole('button', { name: /^auth\b/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^billing\b/i })).toBeVisible();

    const source = page.locator('[data-type-key="auth/Alpha"]');
    const target = page.getByRole('button', { name: /^billing\b/i }).first();
    await dragOnto(page, source, target);

    await expect(page.locator('[data-type-key="billing/Alpha"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-type-key="auth/Alpha"]')).toHaveCount(0);
  });

  test('DnD: dragging an endpoint row onto a different folder header moves it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await addEndpointWithFolder(page, '/login', 'auth');
    await addEndpointWithFolder(page, '/charges', 'billing');

    await expect(page.getByRole('button', { name: /^auth\b/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^billing\b/i })).toBeVisible();

    const source = page.getByRole('button', { name: /\/login/ });
    const target = page.getByRole('button', { name: /^billing\b/i }).first();
    await dragOnto(page, source, target);

    await expect(page.getByRole('button', { name: /^billing\b.*2$/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^auth\b/i })).toHaveCount(0);
  });

  test('dragging a type from a folder onto a root-level type lands at root, not in a new folder named after the target', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByRole('button', { name: /Expand Types|展開 Types/ }).click();
    // Seed: one root type ('Order') and one folder type ('auth/User').
    await page.getByRole('button', { name: 'Add type', exact: true }).click();
    const nameInput = page.getByLabel('Type name');
    await nameInput.fill('Order');
    await nameInput.press('Tab');
    await expect(page.locator('[data-type-key="Order"]')).toBeVisible({ timeout: 5000 });

    await addTypeWithFolder(page, 'User', 'auth');

    // Drag 'auth/User' onto the 'Order' row.
    const source = page.locator('[data-type-key="auth/User"]');
    const target = page.locator('[data-type-key="Order"]');
    await dragOnto(page, source, target);

    // The dragged type should end up at root (key = 'User'), not in a new 'Order/' folder.
    await expect(page.locator('[data-type-key="User"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-type-key="Order/User"]')).toHaveCount(0);
  });
});

async function addTypeWithFolder(page: Page, name: string, folder: string) {
  const typesPanel = page.getByRole('dialog', { name: /^Types$/i });
  // Ensure a pending or real folder of the given name exists.
  const folderHeader = typesPanel.getByRole('button', { name: new RegExp(`^${folder}\\b`, 'i') }).first();
  const pendingFolder = typesPanel.locator(`[data-pending-folder="${folder}"]`);
  const folderExists = (await folderHeader.count()) > 0 || (await pendingFolder.count()) > 0;
  if (!folderExists) {
    await typesPanel.getByRole('button', { name: /^New folder$/ }).click();
    const input = typesPanel.getByRole('textbox', { name: /^New folder$/ });
    await input.fill(folder);
    await input.press('Enter');
  }

  // Add a type — it lands at root with a generated name like 'NewType'.
  await page.getByRole('button', { name: 'Add type', exact: true }).click();
  await expect(page.locator('[data-type-key^="NewType"]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-type-key^="NewType"]').last().click();

  // Rename it first so the selection tracks the new key, then DnD into the folder.
  const nameInput = page.getByLabel('Type name');
  await nameInput.fill(name);
  await nameInput.press('Tab');
  await expect(page.locator(`[data-type-key="${name}"]`)).toBeVisible({ timeout: 5000 });

  const source = page.locator(`[data-type-key="${name}"]`);
  const pendingTarget = page.locator(`[data-pending-folder="${folder}"]`);
  const realTarget = page.getByRole('button', { name: new RegExp(`^${folder}\\b`, 'i') }).first();
  const target = (await pendingTarget.count()) > 0 ? pendingTarget : realTarget;
  await dragOnto(page, source, target);
  await expect(page.locator(`[data-type-key="${folder}/${name}"]`)).toBeVisible({ timeout: 5000 });
}

async function addEndpointWithFolder(page: Page, path: string, folder: string) {
  // Ensure a pending or real folder of the given name exists in EndpointList.
  const endpointsAside = page.locator('aside:has(h2:has-text("Endpoints"))');
  const folderHeader = endpointsAside.getByRole('button', { name: new RegExp(`^${folder}\\b`, 'i') }).first();
  const pendingFolder = endpointsAside.locator(`[data-pending-folder="${folder}"]`);
  const folderExists = (await folderHeader.count()) > 0 || (await pendingFolder.count()) > 0;
  if (!folderExists) {
    await endpointsAside.getByRole('button', { name: /^New folder$/ }).click();
    const input = endpointsAside.getByRole('textbox', { name: /^New folder$/ });
    await input.fill(folder);
    await input.press('Enter');
  }

  // Create a new endpoint and set its path.
  await page.getByRole('button', { name: /New endpoint/i }).click();
  const pathInput = page.getByLabel('Path', { exact: true });
  await expect(pathInput).toHaveValue('/', { timeout: 5000 });
  await pathInput.fill(path);
  await pathInput.press('Tab');

  // DnD the new endpoint row into the folder.
  const source = page.getByRole('button', { name: new RegExp(`GET ${path}`) });
  const pendingTarget = page.locator(`[data-pending-folder="${folder}"]`);
  const realTarget = page.getByRole('button', { name: new RegExp(`^${folder}\\b`, 'i') }).first();
  const target = (await pendingTarget.count()) > 0 ? pendingTarget : realTarget;
  await dragOnto(page, source, target);
  await expect(page.getByRole('button', { name: new RegExp(`^${folder}\\b`, 'i') }).first()).toBeVisible({ timeout: 5000 });
}

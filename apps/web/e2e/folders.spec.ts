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
  test('typing a Folder on an endpoint materializes the tree and persists across reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Create a new endpoint via the plus button in EndpointList.
    await page.getByRole('button', { name: /New endpoint/i }).click();
    // Select the newly-created endpoint row in the sidebar.
    await page.getByRole('button', { name: /^GET \//i }).click();

    // In the editor, fill the Folder input and blur.
    const folder = page.getByLabel('Folder');
    await folder.fill('auth/admin');
    await folder.press('Tab');

    // Sidebar should now render the folder tree — the folder headers appear as chevron-toggled <button>s.
    await expect(page.getByRole('button', { name: /^auth/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^admin/i }).first()).toBeVisible();

    // Reload; the draft store + uiPrefs should reopen with the tree intact.
    await page.reload();
    await expect(page.getByRole('button', { name: /^auth/i }).first()).toBeVisible();
  });

  test('renaming a type folder moves every descendant and updates refs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Open the types panel (CollapsedRail on the left, default label 'Expand Types' in en).
    await page.getByRole('button', { name: /Expand Types|展開 Types/ }).click();
    // Add a type via the + button in the types panel header.
    await page.getByRole('button', { name: /Add type/i }).click();
    // Move the new NewType into the 'auth' folder via the Folder input in the editor.
    const folder = page.getByLabel('Folder').first();
    await folder.fill('auth');
    await folder.press('Tab');

    // Rename the folder via the pencil (Rename folder) icon button.
    await page.getByRole('button', { name: /Rename folder/i }).first().click();
    const renameInput = page.getByRole('textbox', { name: /Rename folder/i });
    await renameInput.fill('identity');
    await renameInput.press('Enter');

    // The old folder name is gone, the new one present.
    // Folder-header buttons render as "<name> <count>", so match on a word-boundary prefix.
    await expect(page.getByRole('button', { name: /^auth\b/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^identity\b/i }).first()).toBeVisible();
  });

  test('DnD: dragging a type row onto a different folder header moves it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Seed: open Types panel, add two types and place them in different folders.
    await page.getByRole('button', { name: /Expand Types|展開 Types/ }).click();
    await addTypeWithFolder(page, 'Alpha', 'auth');
    await addTypeWithFolder(page, 'Beta', 'billing');

    // Both folder headers visible.
    await expect(page.getByRole('button', { name: /^auth\b/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^billing\b/i })).toBeVisible();

    // Drag the 'auth/Alpha' row onto the 'billing' folder header.
    const source = page.locator('[data-type-key="auth/Alpha"]');
    const target = page.getByRole('button', { name: /^billing\b/i }).first();
    await dragOnto(page, source, target);

    // The type's canonical key should now be billing/Alpha.
    await expect(page.locator('[data-type-key="billing/Alpha"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-type-key="auth/Alpha"]')).toHaveCount(0);
  });

  test('DnD: dragging an endpoint row onto a different folder header moves it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Seed: create two endpoints in two folders.
    await addEndpointWithFolder(page, '/login', 'auth');
    await addEndpointWithFolder(page, '/charges', 'billing');

    // Both folder headers visible.
    await expect(page.getByRole('button', { name: /^auth\b/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^billing\b/i })).toBeVisible();

    // Drag the '/login' row onto the 'billing' folder header.
    const source = page.getByRole('button', { name: /\/login/ });
    const target = page.getByRole('button', { name: /^billing\b/i }).first();
    await dragOnto(page, source, target);

    // The 'billing' folder's header count should now read "2" (the new count suffix).
    await expect(page.getByRole('button', { name: /^billing\b.*2$/i })).toBeVisible({ timeout: 5000 });
    // And 'auth' should have disappeared because it's now empty.
    await expect(page.getByRole('button', { name: /^auth\b/i })).toHaveCount(0);
  });
});

async function addTypeWithFolder(page: Page, name: string, folder: string) {
  await page.getByRole('button', { name: 'Add type', exact: true }).click();
  // The new NewType row appears; click to make sure it's selected.
  await expect(page.locator('[data-type-key^="NewType"]')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-type-key^="NewType"]').last().click();
  // Rename first (so the selection tracks the new key), then move into folder.
  const nameInput = page.getByLabel('Type name');
  await nameInput.fill(name);
  await nameInput.press('Tab');
  await expect(page.locator(`[data-type-key="${name}"]`)).toBeVisible({ timeout: 5000 });
  await page.locator(`[data-type-key="${name}"]`).click();
  const folderInput = page.getByLabel('Folder', { exact: true }).first();
  await folderInput.fill(folder);
  await folderInput.press('Tab');
  await expect(page.locator(`[data-type-key="${folder}/${name}"]`)).toBeVisible({ timeout: 5000 });
}

async function addEndpointWithFolder(page: Page, path: string, folder: string) {
  await page.getByRole('button', { name: /New endpoint/i }).click();
  // Wait for a fresh editor on the new endpoint — Path starts at '/' for every
  // newly-created endpoint (see EndpointList.add). Until we observe the reset
  // value, we may still be looking at the previous endpoint's editor.
  const pathInput = page.getByLabel('Path', { exact: true });
  await expect(pathInput).toHaveValue('/', { timeout: 5000 });
  await pathInput.fill(path);
  await expect(pathInput).toHaveValue(path);
  await pathInput.press('Tab');
  // Set the folder to materialize the tree.
  const folderInput = page.getByLabel('Folder', { exact: true }).first();
  await folderInput.fill(folder);
  await folderInput.press('Tab');
  // Folder tree header appears — means the folder field committed.
  await expect(page.getByRole('button', { name: new RegExp(`^${folder}\\b`, 'i') }).first()).toBeVisible({ timeout: 5000 });
}

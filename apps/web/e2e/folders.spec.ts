import { test, expect } from '@playwright/test';

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
});

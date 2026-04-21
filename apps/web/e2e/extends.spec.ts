import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openTypesPanel(page: Page) {
  await page.getByRole('button', { name: /Expand Types|展開 Types/ }).click();
}

async function addType(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add type' }).click();
  // Wait for the fresh NewType (or NewTypeN) row to appear so we know the
  // add action settled. Its key starts with "NewType".
  await expect(page.locator('[data-type-key^="NewType"]')).toBeVisible({ timeout: 5000 });
  // Click the new row to make sure it's selected.
  await page.locator('[data-type-key^="NewType"]').last().click();
  const input = page.getByLabel('Type name');
  await expect(input).toBeVisible();
  await input.fill(name);
  // Press Tab to trigger blur → onBlur → async renameTypeKey → setSpec.
  await input.press('Tab');
  await expect(page.locator(`[data-type-key="${name}"]`)).toBeVisible({ timeout: 5000 });
  // Re-select to be sure the editor below is mounted for this key.
  await page.locator(`[data-type-key="${name}"]`).click();
}

async function addField(page: Page, index: number, fieldName: string) {
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel(`field name ${index}`).fill(fieldName);
}

test.describe('type extension', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openTypesPanel(page);
  });

  test('forward + revert + remove-parent full flow', async ({ page }) => {
    await addType(page, 'Base');
    await addField(page, 0, 'id');

    await addType(page, 'Child');

    // Extends picker renders and offers Base as a candidate.
    await page.locator('select[aria-label="Extends"]').selectOption('Base');

    // Base chip + inherited panel visible.
    await expect(page.getByRole('button', { name: 'Remove parent Base' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Inherited fields/i })).toBeVisible();

    // Override id.
    await page.getByRole('button', { name: 'Override id' }).click();

    // Badge visible, Revert button visible AND wide enough to fit its label (≥40px).
    await expect(page.getByText('(override)')).toBeVisible();
    const revert = page.getByRole('button', { name: /Revert to inherited id/i });
    await expect(revert).toBeVisible();
    const revertBox = await revert.boundingBox();
    expect(revertBox).not.toBeNull();
    expect(revertBox!.width).toBeGreaterThan(40);

    // Revert removes the own field; Override button reappears in the inherited panel.
    await revert.click();
    await expect(page.getByText('(override)')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Override id' })).toBeVisible();

    // Remove the Base parent — inherited panel disappears; select still shows
    // an "Add parent" placeholder option because Base is still a valid candidate.
    await page.getByRole('button', { name: 'Remove parent Base' }).click();
    await expect(page.getByRole('button', { name: /Inherited fields/i })).toHaveCount(0);
    await expect(page.locator('select[aria-label="Extends"] option').first()).toHaveText(/Add parent/);
  });

  test('cycle-inducing candidates are filtered from the picker', async ({ page }) => {
    await addType(page, 'A');
    await addType(page, 'B');
    // A extends B
    await page.locator(`[data-type-key="A"]`).click();
    await page.locator('select[aria-label="Extends"]').selectOption('B');
    // Now edit B; A must NOT appear as a candidate.
    await page.locator(`[data-type-key="B"]`).click();
    const options = await page.locator('select[aria-label="Extends"] option').allTextContents();
    expect(options.some((o) => o === 'A')).toBe(false);
  });

  test('override + revert buttons stay in-viewport at 900px width', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await addType(page, 'Base');
    await addField(page, 0, 'id');
    await addType(page, 'Child');
    await page.locator('select[aria-label="Extends"]').selectOption('Base');
    await page.getByRole('button', { name: 'Override id' }).click();

    await expect(page.getByText('(override)')).toBeVisible();
    const revert = page.getByRole('button', { name: /Revert to inherited id/i });
    const box = await revert.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(900);
  });

  test('multi-parent: two Override buttons appear in the inherited panel', async ({ page }) => {
    await addType(page, 'HasId');
    await addField(page, 0, 'id');
    await addType(page, 'HasTime');
    await addField(page, 0, 'createdAt');
    await addType(page, 'Child');
    await page.locator('select[aria-label="Extends"]').selectOption('HasId');
    await page.locator('select[aria-label="Extends"]').selectOption('HasTime');

    await expect(page.getByRole('button', { name: 'Remove parent HasId' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove parent HasTime' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Override id' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Override createdAt' })).toBeVisible();
  });

  test('no ExtendsPicker for non-object types', async ({ page }) => {
    await addType(page, 'MyString');
    // Switch kind via the kind select. The existing TypeBuilder has a <select aria-label="Kind">.
    await page.locator('select[aria-label="Kind"]').first().selectOption('string');
    // The ExtendsPicker should not render for non-object.
    await expect(page.locator('select[aria-label="Extends"]')).toHaveCount(0);
  });

  test('DnD: drag-reorders parent chips in the Extends picker', async ({ page }) => {
    await addType(page, 'P1');
    await addType(page, 'P2');
    await addType(page, 'Child');

    // Add both parents in order: Child extends [P1, P2].
    await page.locator('select[aria-label="Extends"]').selectOption('P1');
    await page.locator('select[aria-label="Extends"]').selectOption('P2');

    // Chips rendered in order.
    const chips = page.locator('[data-parent-chip]');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveAttribute('data-parent-chip', 'P1');
    await expect(chips.nth(1)).toHaveAttribute('data-parent-chip', 'P2');

    // Drag P1 onto P2 → swap order to [P2, P1].
    const p1 = page.locator('[data-parent-chip="P1"]');
    const p2 = page.locator('[data-parent-chip="P2"]');
    const p1Box = await p1.boundingBox();
    const p2Box = await p2.boundingBox();
    if (!p1Box || !p2Box) throw new Error('chip bounding box missing');
    const sx = p1Box.x + p1Box.width / 2;
    const sy = p1Box.y + p1Box.height / 2;
    const dx = p2Box.x + p2Box.width / 2;
    const dy = p2Box.y + p2Box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 8, sy, { steps: 4 });
    await page.mouse.move(dx, dy, { steps: 12 });
    await page.mouse.up();

    // Chips should now be in the new order.
    await expect(chips.nth(0)).toHaveAttribute('data-parent-chip', 'P2');
    await expect(chips.nth(1)).toHaveAttribute('data-parent-chip', 'P1');
  });
});

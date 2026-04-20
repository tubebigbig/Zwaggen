import { test, expect } from '@playwright/test';

test.describe('responsive layout', () => {
  test('at 900×800: overflow menu exposes Import/Compare; settings is a rail + overlay', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run all/i })).toBeVisible();

    await page.getByRole('button', { name: /more/i }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('Import OpenAPI')).toBeVisible();
    await expect(menu.getByText('Compare')).toBeVisible();
    await expect(menu.getByText('Export')).toHaveCount(0);
    await page.keyboard.press('Escape');

    const envRail = page.getByRole('button', { name: /Expand Environment/i });
    await expect(envRail).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);

    await envRail.click();
    await expect(page.getByRole('complementary', { name: 'Settings' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('complementary', { name: 'Settings' })).toHaveCount(0);
  });

  test('at 900×800: Export menu is reachable at the top level and opens', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    const exportSummary = page.locator('summary').filter({ hasText: 'Export' });
    await expect(exportSummary).toBeVisible();
    await exportSummary.click();
    await expect(page.getByRole('button', { name: /Download bundle/i })).toBeVisible();
  });

  test('at 900×800 in zh-TW: collapse-sidebar aria-label is translated', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('zwaggen:lang', 'zh-TW'));
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    await page.getByRole('button', { name: '展開 環境' }).click();
    await expect(page.getByRole('button', { name: '收合側欄' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveCount(0);
  });

  test('at 1024×800: overflow menu is present and long spec name does not push buttons off-screen', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: /more/i })).toBeVisible();

    const longName = 'A very long API specification name that should truncate gracefully';
    await page.getByRole('button', { name: 'Untitled API' }).click();
    const input = page.getByRole('textbox', { name: 'Name' });
    await input.fill(longName);
    await input.press('Enter');

    const save = page.getByRole('button', { name: 'Save' });
    const runAll = page.getByRole('button', { name: /Run all/i });
    const more = page.getByRole('button', { name: /more/i });
    await expect(save).toBeVisible();
    await expect(runAll).toBeVisible();
    await expect(more).toBeVisible();

    const viewportWidth = 1024;
    for (const locator of [save, runAll, more]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error('no box');
      expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth);
      expect(box.x).toBeGreaterThanOrEqual(0);
    }

    const nameButton = page.getByRole('button', { name: longName }).first();
    const nameBox = await nameButton.boundingBox();
    expect(nameBox).not.toBeNull();
    if (!nameBox) throw new Error('no box');
    expect(nameBox.width).toBeLessThanOrEqual(220);
  });

  test('at 1440×900: all header buttons inline; settings pane pinned', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Import OpenAPI' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compare' })).toBeVisible();
    await expect(page.getByRole('button', { name: /more/i })).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
});

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
    await page.keyboard.press('Escape');

    const envRail = page.getByRole('button', { name: /Expand Environment/i });
    await expect(envRail).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);

    await envRail.click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
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

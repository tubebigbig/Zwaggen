import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Keyboard-DnD coverage. @dnd-kit's KeyboardSensor uses Space to grab/drop
 * and arrow keys to move between droppables. This test exercises the Space
 * grab + screen-reader announcement on TypePanel — the pointer-DnD coverage
 * in `folders.spec.ts` stays as-is. This is purely additive a11y coverage.
 *
 * We assert against @dnd-kit's screen-reader announcement (rendered into a
 * visually-hidden `aria-live` region) rather than trying to drive the full
 * Space → Arrow → Space sequence to a folder drop. Headless Playwright
 * keyboard sequencing through nested droppables is timing-sensitive enough
 * that asserting the announcement is the more stable signal — and proves
 * the wiring (KeyboardSensor + accessibility.announcements) is live.
 */
test.describe('keyboard-DnD', () => {
  test('Space on a focused type row emits the localized "Picked up" announcement', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Open the Types panel and seed a single root-level type 'Alpha'.
    await page.getByRole('button', { name: /Expand Types|展開 Types/ }).click();
    await addTypeAtRoot(page, 'Alpha');

    const row = page.locator('[data-type-key="Alpha"]');
    await expect(row).toBeVisible({ timeout: 5000 });

    // Focus then grab via Space.
    await row.focus();
    await page.keyboard.press('Space');

    // The screen-reader announcement is rendered into a visually-hidden live
    // region by @dnd-kit (`role="status"`, `aria-live="assertive"`). The node
    // is `clip: rect(0 0 0 0)` so it isn't `visible` to Playwright — we read
    // the text content directly instead.
    //
    // After Space, @dnd-kit fires onDragStart immediately followed by
    // onDragOver(self). We accept either — what we're proving is that our
    // localized `useDndAnnouncements()` is wired into the DndContext (a
    // pre-fix run would emit @dnd-kit's English defaults like "Draggable
    // item ... was picked up", not our exact `Picked up X.` phrasing).
    const liveRegions = page.locator('[role="status"][aria-live="assertive"]');
    await expect
      .poll(
        async () => {
          const texts = await liveRegions.allTextContents();
          return texts.join(' | ');
        },
        { timeout: 5000 },
      )
      .toMatch(/Picked up Alpha\.|Alpha is over Alpha\.|已選取 Alpha。|Alpha 在 Alpha 上方。/);

    // Drop in place via Space.
    await page.keyboard.press('Space');
  });
});

async function addTypeAtRoot(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add type', exact: true }).click();
  // Wait for the new row to render.
  const newRow = page.locator('[data-type-key^="NewType"]').last();
  await expect(newRow).toBeVisible({ timeout: 10000 });
  await newRow.click();
  const nameInput = page.getByLabel('Type name');
  await nameInput.fill(name);
  await nameInput.press('Tab');
  await expect(page.locator(`[data-type-key="${name}"]`)).toBeVisible({ timeout: 5000 });
}

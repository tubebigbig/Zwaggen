import { test, expect } from '@playwright/test';

test('create type, endpoint, send against mock', async ({ page }) => {
  await page.route('https://mock.test/users/1', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', age: 'x' }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'New endpoint' }).click();
  await page.getByLabel('Path').fill('/users/1');
  await page.getByLabel('Method').selectOption('GET');
  await page.getByRole('button', { name: 'Add response' }).click();
  // declare 200 returns { id: string, age: number }
  await page.getByLabel('Status').fill('200');
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field name').first().fill('id');
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field name').nth(1).fill('age');
  const kindSelects = page.getByLabel('Kind');
  // kindSelects: [0]=response object, [1]=id field (string), [2]=age field (string)
  await kindSelects.nth(2).selectOption('number');
  await page.getByLabel('Base URL').fill('https://mock.test');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/type errors/)).toBeVisible();
  await expect(page.getByText(/expected number, got string/)).toBeVisible();
});

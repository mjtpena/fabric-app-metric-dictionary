import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

test('loads, creates a record, sees it listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/', 'demo-owner');
  await expect(page.getByRole('heading', { name: 'The Periodic Table of Metrics', level: 1 })).toBeVisible();
  await expect(page.getByTestId('element-tile').first()).toBeVisible();
  await assertNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'Lab' }).first().click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Average Order Value');
  await page.getByLabel('Domain').fill('Sales');
  await page.getByLabel('Definition').fill('Average value of a customer order in the period, after discounts.');
  await page.getByLabel('Formula').fill('Revenue divided by the number of orders in the period.');
  await page.getByLabel('Synonyms').fill('AOV, Basket size');
  await expect(page.getByTestId('lab-symbol')).toHaveText('Ao');
  await page.getByRole('button', { name: 'Create draft' }).click();

  await expect(page.getByTestId('metric-title')).toHaveText('Average Order Value');
  await expect(page.getByTestId('measure-name')).toContainText('Not yet implemented');
  await assertNoHorizontalScroll(page);

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Table' }).click();
  await expect(page.getByTestId('element-tile')).toHaveCount(21);
  await page.getByRole('radio', { name: 'List' }).click();
  await page.getByLabel('Search metrics').fill('basket');
  await expect(page.getByTestId('element-row')).toHaveCount(1);
  await expect(page.getByTestId('element-row').first()).toContainText('Average Order Value');
  await expect(page.getByTestId('element-row').first()).toContainText('Draft');
  consoleWatch.assertClean();
});

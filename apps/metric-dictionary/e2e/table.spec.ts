import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

test('the periodic table renders every metric as a unique element', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/');
  const table = page.getByTestId('periodic-table');
  await expect(table).toHaveAttribute('data-lens', 'domain');
  const tiles = page.getByTestId('element-tile');
  await expect(tiles).toHaveCount(20);
  const symbols = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('data-symbol')));
  expect(new Set(symbols).size).toBe(20);
  for (const s of symbols) expect(s).toMatch(/^[A-Z][a-z]$/);
  // Finishes follow status: approved solid, in review outlined, draft hatched, deprecated faded.
  await expect(page.locator('[data-testid="element-tile"][data-finish="solid"]')).toHaveCount(11);
  await expect(page.locator('[data-testid="element-tile"][data-finish="outlined"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="element-tile"][data-finish="hatched"]')).toHaveCount(4);
  await expect(page.locator('[data-testid="element-tile"][data-finish="faded"]')).toHaveCount(2);
  await expect(page.getByTestId('group-label').filter({ hasText: 'Finance' })).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('lenses re-colour the same table, by click and by key', async ({ page }) => {
  await openApp(page, '/');
  const table = page.getByTestId('periodic-table');
  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Status/ }).click();
  await expect(table).toHaveAttribute('data-lens', 'status');
  await expect(page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Status/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('4');
  await expect(table).toHaveAttribute('data-lens', 'freshness');
  // The freshness lens shows each element's age in its corner.
  await expect(page.locator('[data-testid="element-tile"][data-symbol="Re"] .el-corner')).toHaveText(/^\d+d$/);
  await page.keyboard.press('1');
  await expect(table).toHaveAttribute('data-lens', 'domain');
  await expect(page.locator('[data-testid="element-tile"][data-symbol="Re"] .el-corner')).toHaveText('1.0');
});

test('a Today item focuses the element behind it and switches the lens', async ({ page }) => {
  await openApp(page, '/');
  if (isPhone(page)) {
    await page.getByRole('button', { name: /^Today/ }).click();
    await page.getByRole('dialog').getByRole('button').filter({ hasText: 'Gross Margin' }).click();
  } else {
    await page.getByRole('complementary', { name: 'Today' }).getByRole('button').filter({ hasText: 'Gross Margin' }).click();
  }
  const tile = page.locator('[data-testid="element-tile"][data-symbol="Gm"]');
  await expect(tile).toHaveAttribute('data-focus', 'true');
  await expect(page.getByTestId('periodic-table')).toHaveAttribute('data-lens', 'status');
  const peek = page.getByTestId('element-peek');
  await expect(peek).toContainText('Gross Margin');
  await peek.getByRole('button', { name: 'Open element card' }).click();
  await expect(page.getByTestId('metric-title')).toHaveText('Gross Margin');
  await expect(page.getByTestId('approved-version-banner')).toBeVisible();
});

test('the list view shows the same elements', async ({ page }) => {
  await openApp(page, '/');
  await expect(page.getByTestId('element-tile')).toHaveCount(20);
  const names = await page.getByTestId('element-tile').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? '').split(',')[0]));
  await page.getByRole('radio', { name: 'List' }).click();
  const rows = page.getByTestId('element-row');
  await expect(rows).toHaveCount(20);
  const listed = await rows.getByRole('link').allTextContents();
  expect([...listed].sort()).toEqual([...names].sort());
  await assertNoHorizontalScroll(page);
  // L toggles back to the table.
  await page.keyboard.press('l');
  await expect(page.getByTestId('periodic-table')).toBeVisible();
});

test('find dims everything but the matches and focuses the pick', async ({ page }) => {
  await openApp(page, '/');
  await page.getByLabel('Search metrics').fill('churn');
  await expect(page.getByTestId('search-hit').first()).toContainText('Customer Churn Rate');
  await expect(page.locator('[data-testid="element-tile"]:not([data-dim])')).toHaveCount(4);
  await page.getByLabel('Search metrics').press('Enter');
  await expect(page.locator('[data-testid="element-tile"][data-symbol="Cc"]')).toHaveAttribute('data-focus', 'true');
});

test('view as owner dims the elements someone else owns', async ({ page }) => {
  await openApp(page, '/', 'demo-owner');
  await expect(page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: /Owner/ })).toHaveAttribute('aria-checked', 'true');
  // Sam owns Win Rate; Jordan owns Headcount.
  await expect(page.locator('[data-testid="element-tile"][data-symbol="Wr"]')).not.toHaveAttribute('data-dim', 'true');
  await expect(page.locator('[data-testid="element-tile"][data-symbol="He"]')).toHaveAttribute('data-dim', 'true');
  await page.keyboard.press('v');
  await expect(page.locator('[data-testid="element-tile"][data-symbol="He"]')).not.toHaveAttribute('data-dim', 'true');
});

test('without WebGL the table renders flat, with the same elements', async ({ page }) => {
  await page.goto('/?as=demo-steward&nowebgl#/');
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('periodic-table')).toHaveAttribute('data-mode', 'flat');
  await expect(page.getByTestId('element-tile')).toHaveCount(20);
  await assertNoHorizontalScroll(page);
});

test('keyboard: ? opens the cheat sheet, arrows move between elements', async ({ page }) => {
  test.skip(isPhone(page), 'keyboard shortcuts are a desktop affordance');
  await openApp(page, '/');
  await page.keyboard.press('Shift+?');
  await expect(page.getByTestId('shortcut-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="element-tile"][data-symbol="Re"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid="element-tile"][data-symbol="Gm"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="element-tile"][data-symbol="Gm"]')).toHaveAttribute('data-focus', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('metric-title')).toHaveText('Gross Margin');
});

import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

/** Open a metric's element card through the list view's search. */
async function openMetric(page: Page, name: string, persona?: string) {
  await openApp(page, '/?view=list', persona);
  await page.getByLabel('Search metrics').fill(name);
  await page.getByTestId('element-row').filter({ hasText: name }).first().getByRole('link', { name, exact: true }).click();
  await expect(page.getByTestId('metric-title')).toHaveText(name);
}

test('AC1: a duplicate name in a different case is blocked, with a link to the existing metric', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/metrics/new', 'demo-owner');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('  rEVENUE ');
  await expect(page.getByTestId('duplicate-warning')).toContainText('A metric called “Revenue” already exists');
  await page.getByLabel('Domain').fill('Finance');
  await page.getByLabel('Definition').fill('Another attempt at defining revenue for the period.');
  await page.getByLabel('Formula').fill('Sum of invoices');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Fix the highlighted fields, then save again.')).toBeVisible();
  await page.getByRole('link', { name: 'Open the existing one' }).click();
  await expect(page.getByTestId('metric-title')).toHaveText('Revenue');
  consoleWatch.assertClean();
});

test('AC2: draft, review, approve, edit and re-review give the right versions and statuses', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  // Owner creates a draft and submits it.
  await openApp(page, '/metrics/new', 'demo-owner');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Average Order Value');
  await page.getByLabel('Domain').fill('Sales');
  await page.getByLabel('Definition').fill('Average value of a customer order in the period, after discounts.');
  await page.getByLabel('Formula').fill('Revenue divided by the number of orders in the period.');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByTestId('metric-title')).toHaveText('Average Order Value');
  const url = page.url();
  const id = url.split('#/metrics/')[1];
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('In review').first()).toBeVisible();

  // A steward approves it from the review queue.
  await openApp(page, '/review', 'demo-steward');
  const row = page.getByTestId('review-row').filter({ hasText: 'Average Order Value' });
  await row.getByRole('button', { name: 'Approve Average Order Value' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('review-row').filter({ hasText: 'Average Order Value' })).toHaveCount(0);

  // The owner edits the approved definition: v1.1, back in review, v1.0 banner.
  await openApp(page, `/metrics/${id}/edit`, 'demo-owner');
  await expect(page.getByTestId('approved-edit-notice')).toBeVisible();
  await page.getByLabel('Definition').fill('Average value of a customer order in the period, after discounts and returns.');
  await expect(page.getByTestId('approved-edit-notice')).toContainText('Saving will create v1.1');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('approved-version-banner')).toContainText('v1.0 is the approved version');
  await expect(page.getByText('v1.1').first()).toBeVisible();
  await expect(page.getByTestId('history-list').getByRole('listitem')).toHaveCount(2);

  // Re-review: request changes, the comment shows on top.
  await openApp(page, `/metrics/${id}`, 'demo-steward-owner');
  await page.getByRole('button', { name: 'Request changes' }).click();
  await page.getByRole('dialog').getByLabel('What needs to change').fill('Say which returns window applies.');
  await page.getByRole('dialog').getByRole('button', { name: 'Request changes' }).click();
  await expect(page.getByTestId('changes-banner')).toContainText('Say which returns window applies.');
  await expect(page.getByTestId('approved-version-banner')).toBeVisible();
  consoleWatch.assertClean();
});

test('AC3: a synonym hit is returned and ranked below the exact name hit', async ({ page }) => {
  await openApp(page, '/?view=list');
  await page.getByLabel('Search metrics').fill('revenue');
  const rows = page.getByTestId('element-row');
  await expect(rows.first()).toContainText('Revenue');
  await expect(rows.first().getByRole('link')).toHaveText('Revenue');
  const names = await rows.getByRole('link').allTextContents();
  const bookings = names.indexOf('Bookings');
  expect(bookings).toBeGreaterThan(0);
  await expect(rows.nth(bookings).getByTestId('match-cue')).toHaveText('Matched synonym: Contracted revenue');
  await assertNoHorizontalScroll(page);
});

test('AC4: the diff panel highlights added and removed words', async ({ page }) => {
  await openMetric(page, 'Revenue', 'demo-steward-owner');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Changes since approved (v1.0)' })).toBeVisible();
  const def = page.getByLabel('Definition');
  const text = await def.inputValue();
  await def.fill(text.replace('after returns', 'after customer returns').replace('excluding sales tax', 'excluding tax'));
  const panel = page.getByTestId('diff-definition');
  await expect(panel.locator('ins')).toContainText(['customer']);
  await expect(panel.locator('del')).toContainText(['sales']);
  await expect(page.getByTestId('diff-definition-stats')).toHaveText('+1 / −1 words');
  await assertNoHorizontalScroll(page);
});

test('a steward who owns the metric cannot approve it', async ({ page }) => {
  await openMetric(page, 'Pipeline Coverage', 'demo-steward-owner');
  await expect(page.getByTestId('own-metric-note')).toContainText('another steward has to review it');
  await expect(page.getByRole('button', { name: 'Approve v1.0' })).toBeDisabled();
  await openApp(page, '/review', 'demo-steward-owner');
  await expect(page.getByTestId('review-row').filter({ hasText: 'Pipeline Coverage' })).toContainText('Yours: another steward reviews');
  await assertNoHorizontalScroll(page);
  // The other steward can.
  await openApp(page, '/review', 'demo-steward');
  await expect(
    page.getByTestId('review-row').filter({ hasText: 'Pipeline Coverage' }).getByRole('button', { name: 'Approve Pipeline Coverage' }),
  ).toBeEnabled();
});

test('saving over a newer change warns first, then the last save wins', async ({ page, context }) => {
  await openMetric(page, 'Win Rate', 'demo-owner');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Synonyms').fill('Close rate, Hit rate');

  // Another tab saves first.
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByLabel('Synonyms').fill('Close rate, Conversion rate, Success rate');
  await other.getByRole('button', { name: 'Save changes' }).click();
  await expect(other.getByTestId('metric-title')).toHaveText('Win Rate');
  await other.close();

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('stale-dialog')).toContainText('after you opened this form');
  await page.getByRole('button', { name: 'Save anyway' }).click();
  await expect(page.getByTestId('metric-title')).toHaveText('Win Rate');
  await expect(page.getByText('Hit rate')).toBeVisible();
});

test('deprecated metrics are struck through and link to the replacement', async ({ page }) => {
  await openMetric(page, 'Monthly Churn Count');
  await expect(page.getByTestId('metric-title')).toHaveClass(/line-through/);
  await expect(page.getByTestId('deprecated-banner')).toContainText('A raw count hides growth');
  await page.getByTestId('replacement-link').click();
  await expect(page.getByTestId('metric-title')).toHaveText('Customer Churn Rate');
  await expect(page.getByTestId('history-list').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('approval-line')).toContainText('Approved by');
});

test('export downloads a CSV of approved metrics only', async ({ page }) => {
  await openApp(page, '/export');
  await expect(page.getByTestId('export-count')).toHaveText('11 approved metrics');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^approved-metrics-\d{4}-\d{2}-\d{2}\.csv$/);
  await assertNoHorizontalScroll(page);
});

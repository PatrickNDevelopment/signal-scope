import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  downloadText,
  editDates,
  example,
  freshApp,
  loadSample,
  nav,
  openView,
  parsePct,
  status,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

async function importDemo(page: Page): Promise<void> {
  await openView(page, 'Data');
  const prices = page.getByRole('group', { name: /Import prices/ });
  await prices.getByLabel('Symbol').fill('DEMO');
  await prices.getByLabel('Source').fill('Example file (invented)');
  await prices.getByLabel('CSV file').setInputFiles(example('demo-prices.csv'));
  await expect(status(page)).toContainText('Imported 1 series (DEMO: 250 rows)');
  await page
    .getByRole('group', { name: /Import catalysts/ })
    .getByLabel('CSV file')
    .setInputFiles(example('demo-catalysts.csv'));
  await expect(status(page)).toContainText('Imported 3 events');
}

function dataRows(csv: string): string[][] {
  return csv
    .split('\r\n')
    .filter((l) => l !== '' && !l.startsWith('#'))
    .slice(1)
    .map((l) => l.split(','));
}

test('journey 1: import prices and catalysts, run an event study, compare pre/post, export', async ({
  page,
}) => {
  await importDemo(page);
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);
  const demoRow = page.getByRole('row', { name: /DEMO/ }).first();
  await expect(demoRow).toContainText('250');
  await expect(demoRow).toContainText('Example file (invented)');
  await expect(page.getByTestId('day0-demo-cat-1')).toHaveText('2022-04-26');

  await openView(page, 'Event study');
  await expect(page.getByTestId('car-pre')).toContainText('n = 3 · very small sample');
  await expect(page.getByTestId('car-post')).toContainText('n = 3');
  for (const id of ['demo-cat-1', 'demo-cat-2', 'demo-cat-3']) {
    await expect(page.locator(`[data-row="${id}"]`)).toContainText('included');
  }
  await expect(
    page.getByText('The baseline is the 60 sessions ending 6 sessions before day 0'),
  ).toBeVisible();
  const pre = parsePct((await page.getByTestId('car-pre').locator('.big').textContent()) ?? '');
  const post = parsePct((await page.getByTestId('car-post').locator('.big').textContent()) ?? '');
  expect(Number.isFinite(pre) && Number.isFinite(post)).toBe(true);

  // Narrow to "up" catalysts: two events remain.
  await page.getByLabel('Direction').selectOption('up');
  await expect(page.getByTestId('car-post')).toContainText('n = 2');
  await page.getByLabel('Direction').selectOption('any');

  const { text, download } = await downloadText(page, () =>
    page.getByRole('button', { name: 'Export study CSV' }).click(),
  );
  expect(download.suggestedFilename()).toBe('signal-scope-event-study-DEMO.csv');
  expect(text).toContain(
    '# SignalScope event study\r\n# Descriptive historical calculation. Not investment advice.',
  );
  expect(text).toContain(
    '# Information time: day 0 is the first session strictly after publication',
  );
  expect(text).toContain('# Series DEMO: Example file (invented) (access public, retrieved');
  expect(text).toContain(
    'event_id,kind,label,event_date,published_at,delay_days,day0,baseline_from',
  );
  expect(text).toContain(
    'demo-cat-1,catalyst,"Example product news 1, invented",2022-04-25,2022-04-25,0,2022-04-26,',
  );
  expect(text).toMatch(/\r\ncar_post,3,/);
  const rows = dataRows(text).filter((r) => r[0]?.startsWith('demo-cat'));
  expect(rows).toHaveLength(3);
});

test('journey 2: a disclosure published after the move cannot use the move', async ({ page }) => {
  await loadSample(page);
  await expect(page.getByTestId('delay-disclosure-1')).toHaveText('31');

  // Pretend the filing was public on the transaction date: the rally lands inside the post window.
  await editDates(page, 'disclosure-1', null, '2024-02-26');
  await expect(page.getByTestId('delay-disclosure-1')).toHaveText('0');
  await openView(page, 'Event study');
  await page.getByRole('checkbox', { name: 'catalyst' }).uncheck();
  await page.getByRole('checkbox', { name: 'prediction' }).uncheck();
  await expect(page.getByTestId('study-day0-disclosure-1')).toHaveText('2024-02-27');
  const naive = parsePct((await page.getByTestId('study-post-disclosure-1').textContent()) ?? '');
  expect(naive).toBeGreaterThan(0.08);

  // The real publication is 31 days later, after the move: day 0 moves past it.
  await editDates(page, 'disclosure-1', null, '2024-03-28');
  await expect(page.getByTestId('delay-disclosure-1')).toHaveText('31');
  await expect(page.getByTestId('day0-disclosure-1')).toHaveText('2024-03-29');
  await openView(page, 'Event study');
  await expect(page.getByTestId('study-day0-disclosure-1')).toHaveText('2024-03-29');
  const honest = parsePct((await page.getByTestId('study-post-disclosure-1').textContent()) ?? '');
  expect(Math.abs(honest)).toBeLessThan(0.03);

  // Publication before the transaction is refused.
  await openView(page, 'Data');
  await page.getByRole('button', { name: 'Edit dates of disclosure-1' }).click();
  const form = page.getByRole('form', { name: 'Edit dates of disclosure-1' });
  await form.getByLabel('Published').fill('2024-02-01');
  await expect(form.getByRole('alert')).toHaveText(
    'Publication cannot be before the event itself.',
  );
  await expect(form.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await form.getByRole('button', { name: 'Cancel' }).click();

  // A rule on the disclosure cannot fire before day 0.
  await openView(page, 'Rules & backtest');
  const c1 = page.getByRole('group', { name: /Condition 1/ });
  await c1.getByLabel('Kind').selectOption('disclosure');
  await c1.getByLabel('Direction').selectOption('buy');
  await c1.getByLabel('Within sessions after day 0').fill('10');
  const c2 = page.getByRole('group', { name: /Condition 2/ });
  await c2.getByLabel('Type').selectOption('rsi_above');
  await c2.getByLabel('RSI level').fill('0');
  await expect(page.getByTestId('hits-summary')).toContainText('fired on');
  await expect(page.getByText('Information-time check passed for every signal')).toBeVisible();
  const { text } = await downloadText(page, () =>
    page.getByRole('button', { name: 'Export hits CSV' }).click(),
  );
  const signals = dataRows(text).map((r) => r[0] as string);
  expect(signals.length).toBeGreaterThan(0);
  expect(signals[0]).toBe('2024-03-29');
  for (const s of signals) expect(s > '2024-03-28').toBe(true);
});

test('invalid CSV rows are reported with line numbers and nothing is imported', async ({
  page,
}) => {
  await openView(page, 'Data');
  const prices = page.getByRole('group', { name: /Import prices/ });
  await prices.getByLabel('Symbol').fill('BAD');
  await prices.getByLabel('Source').fill('test');
  await prices.getByLabel('CSV file').setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'date,close\n2024-01-02,10\n2024-01-03,10.5\n2024-02-30,11\n2024-01-05,-2\n2024-01-03,12\n',
    ),
  });
  const alert = prices.getByRole('alert');
  await expect(alert).toContainText('line 4: date "2024-02-30" is not YYYY-MM-DD');
  await expect(alert).toContainText('line 5: a price must be positive');
  await expect(page.getByRole('heading', { name: /^Series/ })).toHaveCount(0);
  await expect(page.getByText('No data loaded.')).toBeVisible();
});

test('a source is required before import, and buy/sell on a catalyst is rejected', async ({
  page,
}) => {
  await openView(page, 'Data');
  const prices = page.getByRole('group', { name: /Import prices/ });
  await prices.getByLabel('Symbol').fill('DEMO');
  await prices.getByLabel('CSV file').setInputFiles(example('demo-prices.csv'));
  await expect(prices.getByRole('alert')).toContainText('Enter the data source');
  const events = page.getByRole('group', { name: /Import catalysts/ });
  await events.getByLabel('CSV file').setInputFiles({
    name: 'ev.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'id,kind,label,symbols,event_date,published_at,direction,source,access\ne1,catalyst,x,DEMO,2024-01-02,2024-01-02,buy,s,public\n',
    ),
  });
  await expect(events.getByRole('alert')).toContainText('line 2: buy/sell is only for disclosures');
});

test('rules need two evidence types; backtest shows train/test and uncertainty badges', async ({
  page,
}) => {
  await loadSample(page);
  await openView(page, 'Rules & backtest');
  await expect(page.getByTestId('bt-train')).toContainText('very few trades');
  await expect(page.getByTestId('bt-test')).toBeVisible();
  const c1 = page.getByRole('group', { name: /Condition 1/ });
  await c1.getByLabel('Type').selectOption('volume_shock');
  await expect(page.getByRole('alert')).toContainText(
    'A rule must cross at least two different evidence types.',
  );
  await expect(page.getByTestId('bt-train')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export trades CSV' })).toHaveCount(0);
  await c1.getByLabel('Type').selectOption('rsi_below');
  await expect(page.getByTestId('bt-train')).toBeVisible();
  const { text } = await downloadText(page, () =>
    page.getByRole('button', { name: 'Export trades CSV' }).click(),
  );
  expect(text).toContain('cost 10 bps per side; one position at a time');
  expect(text).toContain('Not investment advice.');
});

test('saved configurations and the workspace survive a reload', async ({ page }) => {
  await loadSample(page);
  await openView(page, 'Event study');
  await page.getByLabel('Pre-window (sessions)').fill('3');
  await openView(page, 'Saved');
  await page.getByLabel('Name').fill('Narrow pre-window');
  await page.getByRole('button', { name: 'Save current settings' }).click();
  await expect(status(page)).toContainText('Saved configuration "Narrow pre-window".');
  await openView(page, 'Event study');
  await page.getByLabel('Pre-window (sessions)').fill('7');
  await page.reload();
  await expect(page.getByTestId('sample-banner')).toBeVisible();
  await expect(page.getByLabel('Pre-window (sessions)')).toHaveValue('7');
  await openView(page, 'Saved');
  await page.getByRole('button', { name: 'Load configuration Narrow pre-window' }).click();
  await openView(page, 'Event study');
  await expect(page.getByLabel('Pre-window (sessions)')).toHaveValue('3');
  await expect(page.getByTestId('car-pre')).toContainText('days −3 to −1');
});

test('workspace JSON exports, re-imports, and rejects a broken file', async ({ page }) => {
  await loadSample(page);
  await openView(page, 'Saved');
  const { text } = await downloadText(page, () =>
    page.getByRole('button', { name: 'Export workspace JSON' }).click(),
  );
  expect(JSON.parse(text)).toMatchObject({ schema: 'signal-scope.workspace', version: 1 });
  await page.getByRole('button', { name: 'Clear workspace' }).click();
  await page.getByRole('button', { name: 'Yes, clear' }).click();
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);
  const input = page.getByLabel('Import workspace JSON (replaces the current one)');
  await input.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema":"signal-scope.workspace","version":9}'),
  });
  await expect(page.getByRole('alert')).toContainText('The workspace was not imported');
  await input.setInputFiles({
    name: 'ws.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(status(page)).toContainText('4 series, 8 events');
  await expect(page.getByTestId('sample-banner')).toBeVisible();
});

test('a corrupted stored workspace is kept aside and reported, not silently dropped', async ({
  page,
}) => {
  await page.evaluate(() => localStorage.setItem('signal-scope.workspace.v1', '{"schema":"nope"'));
  await page.reload();
  await expect(page.getByRole('alert').first()).toContainText(
    'The saved workspace could not be read',
  );
  expect(await page.evaluate(() => localStorage.getItem('signal-scope.workspace.v1.corrupt'))).toBe(
    '{"schema":"nope"',
  );
  await expect(page.getByText('No data loaded.')).toBeVisible();
});

test('indicators and correlations are labelled as descriptive, not causal', async ({ page }) => {
  await loadSample(page);
  await openView(page, 'Indicators');
  await expect(page.getByText('It does not show that one market causes the other')).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Pearson correlation between SMPL-A and SMPL-B/ }),
  ).toBeVisible();
  const { text } = await downloadText(page, () =>
    page.getByRole('button', { name: 'Export indicators CSV' }).click(),
  );
  expect(text).toContain('date,value,volume,return,vol_20,rsi_14,volume_z_20');
  expect(text).toContain('SAMPLE DATA');
});

test('empty states point to the Data page', async ({ page }) => {
  for (const name of ['Event study', 'Indicators', 'Rules & backtest']) {
    await openView(page, name);
    await expect(page.getByRole('link', { name: 'Go to Data' })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Go to Data' }).click();
  await expect(nav(page).getByRole('link', { name: 'Data', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('mobile width has no horizontal page scroll on any page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loadSample(page);
  for (const name of ['Data', 'Event study', 'Indicators', 'Rules & backtest', 'Saved', 'About']) {
    await openView(page, name);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, name).toBeLessThanOrEqual(0);
  }
});

test('screenshots for the docs', async ({ page }) => {
  const dir = join(process.cwd(), 'docs', 'screenshots');
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadSample(page);
  await page.screenshot({ path: join(dir, 'data-desktop.png'), fullPage: true });
  await openView(page, 'Event study');
  await page.screenshot({ path: join(dir, 'study-desktop.png'), fullPage: true });
  await openView(page, 'Rules & backtest');
  await page.screenshot({ path: join(dir, 'rules-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await openView(page, 'Event study');
  await page.screenshot({ path: join(dir, 'study-mobile.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: join(dir, 'study-dark.png'), fullPage: true });
});

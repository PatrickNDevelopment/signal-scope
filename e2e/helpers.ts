import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Download, type Page } from '@playwright/test';

export const nav = (page: Page) => page.getByRole('navigation', { name: 'Sections' });
export const status = (page: Page) => page.getByRole('status');
export const example = (name: string): string => join(process.cwd(), 'examples', name);

export async function freshApp(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'SignalScope' })).toBeVisible();
}

export async function openView(page: Page, name: string): Promise<void> {
  await nav(page).getByRole('link', { name, exact: true }).click();
  await expect(nav(page).getByRole('link', { name, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
}

export async function loadSample(page: Page): Promise<void> {
  await openView(page, 'Data');
  await page.getByRole('button', { name: 'Load sample market' }).click();
  await expect(page.getByTestId('sample-banner')).toBeVisible();
}

export async function downloadText(
  page: Page,
  action: () => Promise<void>,
): Promise<{ text: string; download: Download }> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  return { text: readFileSync(await download.path(), 'utf8'), download };
}

/** Parses "+1.23 %" / "-4.56 %" into a fraction. */
export function parsePct(s: string): number {
  const m = /([+-]?\d+(?:\.\d+)?)\s*%/.exec(s.replace('−', '-'));
  if (!m) throw new Error(`no percentage in "${s}"`);
  return Number(m[1]) / 100;
}

export async function editDates(
  page: Page,
  id: string,
  eventDate: string | null,
  publishedAt: string,
): Promise<void> {
  await openView(page, 'Data');
  await page.getByRole('button', { name: `Edit dates of ${id}` }).click();
  const form = page.getByRole('form', { name: `Edit dates of ${id}` });
  if (eventDate !== null) await form.getByLabel(/date/i).first().fill(eventDate);
  await form.getByLabel('Published').fill(publishedAt);
  await form.getByRole('button', { name: 'Apply' }).click();
  await expect(status(page)).toContainText(`Updated ${id}`);
}

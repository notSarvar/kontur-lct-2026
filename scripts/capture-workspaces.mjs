// Read-only: no simulation, scenario loading or plan changes.
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const productUrl = process.env.REPORT_URL || 'http://localhost:4317';
const directory = new URL('../screenshots/workspaces-2026-09-26/', import.meta.url);
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.request.get(`${productUrl}/api/state`);
  if (!response.ok()) throw new Error('Сервер недоступен');
  const before = await response.json();
  await page.goto(productUrl);
  await expect(page.locator('.dispatch-metrics')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Демонстрация', exact: true })).toHaveCount(0);
  await page.screenshot({ path: new URL('01-product.png', directory).pathname });
  await page.goto(before.workspace.hackathonUrl);
  await expect(page.getByRole('heading', { name: 'Пульт демонстрации' })).toBeVisible();
  await expect(page.locator('.connection')).toHaveText('Синхронизировано');
  await page.screenshot({ path: new URL('02-hackathon.png', directory).pathname });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: new URL('03-hackathon-mobile.png', directory).pathname });
  const after = await (await page.request.get(`${productUrl}/api/state`)).json();
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      productUrl,
      hackathonUrl: before.workspace.hackathonUrl,
      revision: after.revision,
      unchanged: true,
      screenshots: directory.pathname,
    }),
  );
} finally {
  await browser.close();
}

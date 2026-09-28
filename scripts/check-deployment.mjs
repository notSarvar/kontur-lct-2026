// Checks an existing deployment without applying changes or resetting its data.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const baseURL = process.env.DEPLOY_URL;
if (!baseURL) throw new Error('Set DEPLOY_URL to the deployed site origin.');
const output = process.env.DEPLOY_SCREENSHOTS;
if (output) await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const beforeResponse = await page.request.get(`${baseURL}/api/state`);
  assert(beforeResponse.ok());
  const before = await beforeResponse.json();
  const optimizers = await (await page.request.get(`${baseURL}/api/optimizers`)).json();
  assert.equal(optimizers.ortools.available, true);

  const stream = await fetch(`${baseURL}/api/events`, { signal: AbortSignal.timeout(5000) });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /connected/);
  await reader.cancel();

  await page.goto(baseURL);
  await expect(page.getByRole('region', { name: 'Сводка дня' })).toBeVisible();
  await expect(page.locator('.topbar .metric-link')).toHaveCount(0);
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await expect(page.locator('.timeline-row')).toHaveCount(before.engineers.length);
  await page.locator('.gantt-job').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await page.getByRole('button', { name: 'Пересчитать план', exact: true }).click();
  await expect(page.getByLabel('Сводка изменений')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Отменить изменения' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  if (output) await page.screenshot({ path: `${output}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Раздел приложения')).toBeVisible();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (output) await page.screenshot({ path: `${output}/mobile.png` });
  const after = await (await page.request.get(`${baseURL}/api/state`)).json();
  assert.equal(after.revision, before.revision, 'The shared day changed during the check.');
  assert.deepEqual(after.jobs, before.jobs);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        url: baseURL,
        dataset: before.dataset?.name,
        jobs: before.jobs.length,
        engineers: before.engineers.length,
        revision: before.revision,
        ortools: optimizers.ortools,
        sse: true,
        browser: 'desktop and mobile passed; preview cancelled; state unchanged',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

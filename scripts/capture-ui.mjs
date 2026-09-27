// Read-only capture: opens UI views without resetting or changing the working day.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const target = process.env.REPORT_URL || 'http://127.0.0.1:4317';
const output = path.resolve('screenshots/ui-2026-09-18');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(target);
  await page.locator('.attention-block').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator('.leaflet-tile-loaded')
    .first()
    .waitFor({ timeout: 12000 })
    .catch(() => {});
  await page.screenshot({ path: path.join(output, '01-overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await page.locator('.compact-route-toggle').first().click();
  await page.screenshot({ path: path.join(output, '02-timeline.png'), fullPage: true });
  await page.getByRole('button', { name: /Свободный инженер/ }).click();
  await page.screenshot({ path: path.join(output, '03-availability.png') });
  await page.keyboard.press('Escape');
  await page.locator('.gantt-job').first().click();
  await page.screenshot({ path: path.join(output, '04-job.png') });
  await page.keyboard.press('Escape');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Команда/ })
    .click();
  await page.screenshot({ path: path.join(output, '05-team.png'), fullPage: true });
  const { workspace } = await (await page.request.get(`${target}/api/state`)).json();
  await page.goto(workspace.hackathonUrl);
  await page.locator('.simulation').waitFor();
  await page.screenshot({ path: path.join(output, '06-demo.png'), fullPage: true });
  await page.goto(target);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Раздел приложения').selectOption('overview');
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await page
    .waitForFunction(
      () => {
        const tiles = [...document.querySelectorAll('.leaflet-tile')];
        return tiles.length > 0 && tiles.every((tile) => tile.complete && tile.naturalWidth > 0);
      },
      {},
      { timeout: 12000 },
    )
    .catch(() => {});
  await page.screenshot({ path: path.join(output, '07-mobile.png'), fullPage: true });
  const state = await (await page.request.get(`${target}/api/state`)).json();
  console.log(
    JSON.stringify({
      output,
      errors,
      dataset: state.dataset?.id,
      jobs: state.jobs.length,
      engineers: state.engineers.length,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    }),
  );
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}

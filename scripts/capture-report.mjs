import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const target = process.env.REPORT_URL;
if (!target) throw new Error('Set REPORT_URL to a separate demo instance: capture reloads its day.');
const output = path.resolve('reports/team-update-2026-09-17');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  async function waitForMap(selector = '.route-map') {
    await page.locator(`${selector} .leaflet-tile-loaded`).first().waitFor({ timeout: 25000 });
    await page.waitForFunction(
      (root) => {
        const tiles = [...document.querySelectorAll(`${root} .leaflet-tile`)];
        return tiles.length > 0 && tiles.every((tile) => tile.complete && tile.naturalWidth > 0);
      },
      selector,
      { timeout: 25000 },
    );
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.request.post(`${target}/api/action`, {
    data: { type: 'dataset.load', payload: { id: 'southcenter' } },
  });
  if (!response.ok()) throw new Error(await response.text());
  const state = await response.json();
  await page.goto(target);
  await page.getByRole('heading', { name: 'Карта выездов', exact: true }).waitFor();
  await waitForMap();
  await page.evaluate(() => document.fonts.ready);
  const route = [...state.plan.routes].sort((a, b) => b.stops.length - a.stops.length)[0];
  const engineer = state.engineers.find((item) => item.id === route.engineerId);
  await page.getByLabel('Инженер на карте и графике').selectOption(engineer.id);
  await waitForMap();
  await page.screenshot({ path: path.join(output, '01-dispatcher.png') });
  const { workspace } = await (await page.request.get(`${target}/api/state`)).json();
  await page.goto(workspace.hackathonUrl);
  await page.locator('.simulation').waitFor();
  await page.getByRole('heading', { name: 'Текущий план и базовый алгоритм' }).waitFor();
  await page.screenshot({ path: path.join(output, '02-analytics.png') });
  await page.goto(target);
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Поддержка/ })
    .click();
  await page.getByRole('button', { name: 'Согласовать заявку', exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  await waitForMap('.picker-map');
  await page.screenshot({ path: path.join(output, '03-resolution.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await page.getByLabel('Выбрать инженера').selectOption(engineer.id);
  await waitForMap('.phone-map');
  await page.screenshot({ path: path.join(output, '04-engineer.png') });
  await fs.copyFile(path.join(output, '01-dispatcher.png'), 'screenshots/dispatcher.png');
  await fs.copyFile(path.join(output, '04-engineer.png'), 'screenshots/engineer.png');
  await fs.writeFile(
    path.join(output, 'capture.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        dataset: state.dataset.id,
        metrics: state.plan.metrics,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Screenshots saved to ${output}`);
} finally {
  await browser.close();
}

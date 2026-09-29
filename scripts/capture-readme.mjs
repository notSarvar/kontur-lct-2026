// Uses its own temporary day and an ephemeral loopback port; never connects to a deployed app.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'screenshots/readme');
await fs.access(path.join(root, 'dist/index.html'));
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kontur-readme-'));
Object.assign(process.env, {
  HOST: '127.0.0.1',
  PORT: '0',
  DATA_DIR: dataDir,
  PRODUCT_ORIGIN: 'http://localhost',
  HACKATHON_ORIGIN: 'http://hackathon.localhost',
});
process.argv.push('--production');
let server, browser;
try {
  const { startServer } = await import('../server/http/server.js');
  server = await startServer();
  if (!server.listening) await once(server, 'listening');
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  const page = await browser.newPage({
    baseURL,
    viewport: { width: 1440, height: 1320 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.request.post('/api/action', {
    data: { type: 'clock', payload: { time: 640 } },
  });
  assert(response.ok(), await response.text());
  const state = await response.json();
  await fs.mkdir(output, { recursive: true });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Карта выездов', exact: true }).waitFor();
  const dismiss = page.getByRole('button', { name: 'Закрыть результаты расчёта' });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => {
      const tiles = [...document.querySelectorAll('.leaflet-tile')];
      return (
        tiles.length > 0 &&
        tiles.every(
          (tile) => tile.complete && tile.naturalWidth > 0 && Number(getComputedStyle(tile).opacity) === 1,
        )
      );
    },
    null,
    { timeout: 30000 },
  );
  const capture = async (name, target = page) => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await target.screenshot({ path: path.join(output, name), animations: 'disabled' });
  };
  const mapBox = await page.locator('.map-panel').boundingBox();
  await page.screenshot({
    path: path.join(output, 'dispatcher.png'),
    fullPage: true,
    clip: { x: 0, y: 0, width: 1440, height: Math.ceil(mapBox.y + mapBox.height + 16) },
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await page.locator('.gantt-job').first().waitFor();
  await capture('gantt.png', page.locator('.map-panel'));
  const working = state.jobs.find((job) => job.status === 'working' && job.sop);
  assert(working, 'Expected an active visit with SOP in the default Southcenter scenario');
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await page.getByLabel('Выбрать инженера').selectOption(working.engineerId);
  await page.locator('.phone').getByRole('heading', { name: 'Работа на объекте' }).waitFor();
  await capture('engineer.png', page.locator('.phone'));
  await page.goto('/hackathon');
  await page.locator('.simulation').waitFor();
  await page.goto('/onboarding');
  await page.locator('.onboarding-tour').waitFor();
  assert.deepEqual(errors, []);
  console.log('Saved dispatcher, Gantt and engineer screenshots; public paths load without browser errors.');
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  await fs.rm(dataDir, { recursive: true, force: true });
}

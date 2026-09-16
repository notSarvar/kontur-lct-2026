import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
// Opt in: this check uses the public map/routing services and resets the demo day.
test('live provider check and delivery screenshots', async ({ page, request }) => {
  test.skip(process.env.LIVE_MAPS !== '1', 'Enable LIVE_MAPS=1 to check the public providers.');
  test.setTimeout(60000);
  const update = async (type, payload) => {
    const r = await request.post('/api/action', { data: { type, payload }, timeout: 30000 });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  await update('settings', { roadMode: 'estimate', stability: true });
  await update('generate', { count: 18, engineerCount: 4, seed: 42 });
  const state = await update('settings', { roadMode: 'osrm', stability: true });
  console.log(
    'Routing:',
    state.plan.roadSource,
    'Road geometries:',
    state.plan.routes.filter((r) => r.roadGeometry).length,
    'Assigned:',
    state.plan.metrics.assigned,
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fs.mkdir('screenshots', { recursive: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Рабочий день под контролем' })).toBeVisible();
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('.leaflet-tile')].filter((i) => i.complete && i.naturalWidth > 0)
          .length >= 4,
      {},
      { timeout: 12000 },
    )
    .catch(() => {});
  console.log('Loaded map tiles:', await page.locator('.leaflet-tile-loaded').count());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'screenshots/dispatcher.png', fullPage: true });
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('.leaflet-tile')].filter((i) => i.complete && i.naturalWidth > 0)
          .length >= 2,
      {},
      { timeout: 8000 },
    )
    .catch(() => {});
  await page.screenshot({ path: 'screenshots/engineer.png', fullPage: true });
  expect(errors).toEqual([]);
});

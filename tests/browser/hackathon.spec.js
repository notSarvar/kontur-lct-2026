import { test, expect } from '@playwright/test';
import { hackathonUrl, openHackathon } from './workspaces.js';

test('hackathon host controls the same day and product receives updates live', async ({
  page,
  context,
  request,
}) => {
  await request.post('/api/action', {
    data: { type: 'generate', payload: { count: 12, engineerCount: 4, seed: 42 } },
  });
  await page.goto('/?demo=1');
  await expect(page.locator('.compact-route-toggle')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Демонстрация', exact: true })).toHaveCount(0);
  await expect(page.locator('.simulation')).toHaveCount(0);
  const demo = await context.newPage();
  const errors = [];
  demo.on('pageerror', (error) => errors.push(error.message));
  await openHackathon(demo);
  await expect(demo).toHaveTitle('Контур — пульт хакатона');
  await expect(demo.getByRole('heading', { name: 'Пульт демонстрации' })).toBeVisible();
  await expect(demo.locator('.sidebar')).toHaveCount(0);
  await expect(demo.getByRole('link', { name: 'Открыть продукт' })).toHaveAttribute('target', '_blank');
  await demo.getByRole('button', { name: '+30 мин', exact: true }).click();
  await expect(demo.locator('.simulation-clock')).toContainText('08:30');
  await expect(page.locator('.day-context time')).toHaveText('08:30');
  await expect(demo.locator('.simulation')).toBeVisible();
  await demo.getByRole('button', { name: 'Настройки расчёта', exact: true }).click();
  await demo.getByRole('button', { name: 'Применить и пересчитать', exact: true }).click();
  await demo.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(demo.getByRole('dialog')).toHaveCount(0);
  await expect(demo.locator('.simulation')).toBeVisible();
  const [productState, demoState] = await Promise.all([
    request.get('/api/state').then((r) => r.json()),
    demo.evaluate(() => fetch('/api/state').then((r) => r.json())),
  ]);
  expect(productState.workspace.mode).toBe('product');
  expect(demoState.workspace.mode).toBe('hackathon');
  expect(demoState.plan).toEqual(productState.plan);
  expect(demoState.revision).toBe(productState.revision);
  const denied = await request.post('/api/action', {
    headers: { Origin: hackathonUrl() },
    data: { type: 'clock', payload: { time: 540 } },
  });
  expect(denied.status()).toBe(403);
  await demo.reload();
  await expect(demo.locator('.simulation-clock')).toContainText('08:30');
  await demo.setViewportSize({ width: 390, height: 844 });
  await expect(demo.getByRole('link', { name: 'Открыть продукт' })).toBeVisible();
  expect(await demo.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

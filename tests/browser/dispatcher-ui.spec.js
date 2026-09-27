import { openHackathon } from './workspaces.js';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const result = await request.post('/api/action', {
    data: { type: 'generate', payload: { seed: 42, count: 18, engineerCount: 4 } },
  });
  expect(result.ok()).toBeTruthy();
});

test('operational dashboard has actionable metrics, collapsible neutral team and separate demo tools', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.simulation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Новая заявка', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Пересчитать план', exact: true })).toBeVisible();
  await expect(page.locator('.topbar .header-metrics .metric-link')).toHaveCount(3);
  await expect(page.getByLabel('Режим планирования', { exact: true })).toHaveCount(0);
  await expect(page.getByText('ОПЕРАТИВНОЕ УПРАВЛЕНИЕ')).toHaveCount(0);
  await expect(page.getByText('Длина маршрутов', { exact: true })).toHaveCount(0);
  await expect(page.locator('.compact-route-toggle')).toHaveCount(4);
  await expect(page.locator('.compact-route-body')).toHaveCount(0);
  const first = page.locator('.compact-route-toggle').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await first.click();
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Развернуть все', exact: true }).click();
  await expect(page.locator('.compact-route-body')).toHaveCount(4);
  const colors = await page
    .locator('.compact-route .avatar')
    .evaluateAll((avatars) => avatars.map((el) => getComputedStyle(el).color));
  expect(new Set(colors).size).toBe(1);
  await page.locator('.metric-link').filter({ hasText: 'Выполнено' }).click();
  await expect(page.getByLabel('Фильтр заявок')).toHaveValue('done');
  await expect(page.locator('.dispatch-metrics')).toHaveCount(0);
  await openHackathon(page);
  await expect(page.locator('.simulation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Текущий план и базовый алгоритм' })).toBeVisible();
});

test('free engineer lookup highlights the chosen window without mutating the plan', async ({
  page,
  request,
}) => {
  const before = await (await request.get('/api/state')).json();
  await page.goto('/');
  await page.getByRole('button', { name: /Свободный инженер/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Дорога к новой заявке');
  await page.getByLabel('Минимум свободного времени').selectOption('15');
  await page
    .getByRole('button', { name: /Показать окно:/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.gantt-free-window')).toHaveCount(1);
  await expect(page.locator('.gantt-focus-note')).toContainText('Свободное окно');
  await expect(page.getByLabel('Инженер на карте и графике')).not.toHaveValue('all');
  const after = await (await request.get('/api/state')).json();
  expect(after.revision).toBe(before.revision);
  expect(after.plan).toEqual(before.plan);
});

test('gantt jobs and dialogs remain usable on desktop and narrow screens', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await expect(page.locator('.timeline-row')).toHaveCount(4);
  await page.getByLabel('Масштаб графика').selectOption('2');
  const job = page.locator('.gantt-job').first();
  const label = await job.getAttribute('aria-label');
  await job.click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName(label.split(' · ')[0]);
  await expect(page.getByRole('dialog')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(job).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Раздел приложения')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await job.click();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByLabel('Раздел приложения').selectOption('team');
  await expect(page.getByRole('button', { name: 'Добавить инженера', exact: true })).toBeVisible();
  await page.getByLabel('Раздел приложения').selectOption('settings');
  await expect(page.getByRole('dialog', { name: 'Настройки расчёта' })).toBeVisible();
  await expect(page.getByLabel('Цель планирования')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByLabel('Раздел приложения')).toHaveValue('team');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('expanded schedule keeps the selected engineer and never changes the plan', async ({
  page,
  request,
}) => {
  const before = await (await request.get('/api/state')).json();
  await page.goto('/');
  await page.getByLabel('Инженер на карте и графике').selectOption(before.engineers[1].id);
  await page.getByRole('button', { name: 'Развернуть расписание' }).click();
  await expect(page.getByRole('dialog', { name: 'Карта выездов' })).toBeVisible();
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('График выездов');
  await expect(page.locator('.timeline-row')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Инженер на карте и графике')).toHaveValue(before.engineers[1].id);
  await expect(page.locator('.timeline-row')).toHaveCount(1);
  const after = await (await request.get('/api/state')).json();
  expect(after.revision).toBe(before.revision);
  expect(after.plan).toEqual(before.plan);
});

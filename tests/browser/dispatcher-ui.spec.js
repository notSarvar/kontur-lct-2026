import { openHackathon } from './workspaces.js';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const result = await request.post('/api/action', {
    data: { type: 'generate', payload: { seed: 42, count: 18, engineerCount: 4 } },
  });
  expect(result.ok()).toBeTruthy();
});

test('operational dashboard has actionable metrics, collapsible team and separate demo tools', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.simulation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Новая заявка', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Пересчитать план', exact: true })).toBeVisible();
  await expect(page.locator('.topbar .metric-link')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Сводка дня' }).getByRole('button')).toHaveCount(3);
  await expect(page.getByText('Синхронизировано', { exact: true })).toHaveCount(0);
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

test('connection warning appears only during a failed live connection and clears on reconnect', async ({
  page,
}) => {
  let unavailable = true;
  await page.route('**/api/events', (route) => (unavailable ? route.abort() : route.continue()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Нет связи с сервером');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  unavailable = false;
  await expect(page.locator('.connection-warning')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByText('Синхронизировано', { exact: true })).toHaveCount(0);
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

test('working visits fill with elapsed time and keep priority visible through live updates', async ({
  page,
  request,
}, testInfo) => {
  const initial = await (await request.get('/api/state')).json();
  const urgentResponse = await request.post('/api/action', {
    data: { type: 'job.save', payload: { ...initial.jobs[0], priority: 'urgent' } },
  });
  expect(urgentResponse.ok()).toBeTruthy();
  const state = await urgentResponse.json();
  const jobs = new Map(state.jobs.map((job) => [job.id, job]));
  const stops = state.plan.routes.flatMap((route) => route.stops);
  const stop = stops.find((stop) => jobs.get(stop.jobId).priority === 'urgent') || stops[0];
  const job = jobs.get(stop.jobId);
  await page.goto('/');
  await expect(page.locator('.compact-route .avatar').first()).toHaveCSS(
    'background-color',
    'rgb(255, 207, 0)',
  );
  await page.getByRole('button', { name: 'График', exact: true }).click();
  const bar = page.locator('.gantt-job').filter({ hasText: new RegExp(`^№${job.number}$`) });
  await expect(bar).not.toHaveClass(/working/);
  await expect(page.locator('.gantt-person .avatar').first()).toHaveCSS(
    'background-color',
    'rgb(255, 207, 0)',
  );
  await expect(page.locator('.gantt-travel').first()).toHaveCSS(
    'background-image',
    /repeating-linear-gradient.*rgb\(255, 207, 0\).*rgb\(36, 36, 36\)/,
  );
  for (const fraction of [0, 0.25, 0.5]) {
    const elapsed = Math.floor((stop.end - stop.start) * fraction);
    const response = await request.post('/api/action', {
      data: { type: 'clock', payload: { time: stop.start + elapsed } },
    });
    expect(response.ok()).toBeTruthy();
    const next = await response.json();
    expect(next.jobs.find((j) => j.id === job.id).status).toBe('working');
    await expect(bar).toHaveClass(/working/);
    const progress = (elapsed / (stop.end - stop.start)) * 100;
    await expect(bar).toHaveCSS('--job-progress', `${progress}%`);
    await expect(bar).toHaveAccessibleName(
      new RegExp(`В работе: прошло ${Math.round(progress)}% планового времени`),
    );
    await expect
      .poll(() =>
        bar.evaluate((el) => {
          const fill = parseFloat(getComputedStyle(el, '::before').width);
          return Math.round((fill / el.clientWidth) * 100);
        }),
      )
      .toBe(Math.round(progress));
  }
  if (job.priority === 'urgent') await expect(bar).toHaveCSS('border-top-color', 'rgb(178, 56, 45)');
  const future = page.locator('.gantt-job:not(.working)').first();
  await expect(future).toHaveCSS('--job-progress', '');
  await bar.scrollIntoViewIfNeeded();
  await page.locator('.map-panel').screenshot({ path: testInfo.outputPath('gantt-progress-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('.map-panel').screenshot({ path: testInfo.outputPath('gantt-progress-mobile.png') });
  await bar.click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName(`Заявка №${job.number}`);
  await page.keyboard.press('Escape');
  const finished = await request.post('/api/action', {
    data: { type: 'clock', payload: { time: stop.end } },
  });
  expect(finished.ok()).toBeTruthy();
  expect((await finished.json()).jobs.find((j) => j.id === job.id).status).toBe('done');
  await expect(bar).toHaveCount(0);
});

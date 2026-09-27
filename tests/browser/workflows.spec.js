import { openHackathon } from './workspaces.js';
import { test, expect } from '@playwright/test';
test.describe.configure({ mode: 'serial' });
async function action(request, type, payload = {}) {
  const res = await request.post('/api/action', { data: { type, payload } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}
test.beforeEach(async ({ request }) => {
  await action(request, 'settings', { roadMode: 'estimate', stability: true });
  await action(request, 'generate', { seed: 42, count: 18, engineerCount: 4 });
});
test('dispatcher, map, graph and all navigation screens render without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Карта выездов', exact: true })).toBeVisible();
  await expect(page.locator('.job-pin')).toHaveCount(18);
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await expect(page.locator('.timeline-row')).toHaveCount(4);
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  for (const [nav, selector] of [
    ['Заявки', '.jobs-panel'],
    ['Команда', '.team-directory'],
    ['Аналитика', '.analytics-grid'],
    ['Поддержка', '.support-panel'],
  ]) {
    await page
      .locator('.sidebar nav')
      .getByRole('button', { name: new RegExp(nav) })
      .click();
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator('.dispatch-metrics')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Новая заявка', exact: true })).toHaveCount(
      nav === 'Заявки' ? 1 : 0,
    );
    await expect(page.getByRole('button', { name: 'Пересчитать план', exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
test('custom input creates a real new route assignment, report syncs to a second client', async ({
  page,
  context,
  request,
}) => {
  await page.goto('/');
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Заявки/ })
    .click();
  await page.getByRole('button', { name: 'Новая заявка', exact: true }).click();
  await page.getByLabel('Название заявки', { exact: true }).fill('Тест: диагностика офиса');
  await page.getByLabel('Адрес / название объекта').fill('Тестовый офис на карте');
  await page.getByRole('button', { name: 'Создать и перепланировать' }).click();
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await (await request.get('/api/state')).json();
  expect(state.jobs).toHaveLength(19);
  const job = state.jobs.find((j) => j.title === 'Тест: диагностика офиса');
  expect(job.engineerId).toBeTruthy();
  await second.getByLabel('Выбрать инженера').selectOption(job.engineerId);
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Заявки/ })
    .click();
  await page.getByPlaceholder('Адрес, номер или тип работ').fill('Тест:');
  await page.getByRole('row').filter({ hasText: 'Тест: диагностика офиса' }).click();
  await page.getByLabel('Отчёт инженера').fill('Проверено в браузере: сигнал стабилен');
  await page.getByRole('button', { name: 'Сохранить отчёт' }).click();
  await expect(page.locator('.job-note')).toContainText('сигнал стабилен');
  await second.locator('.phone-nav').getByRole('button', { name: 'События' }).click();
  await expect(second.locator('.phone-events')).toContainText('сигнал стабилен');
  await page.reload();
  await page.getByRole('button', { name: 'Уведомления', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('сигнал стабилен');
});
test('simulated execution, break, manual completion, issue handling and history are connected', async ({
  page,
  request,
}) => {
  let s = await (await request.get('/api/state')).json();
  const route = s.plan.routes.find((r) => r.stops.length),
    stop = route.stops[0],
    engineer = s.engineers.find((e) => e.id === route.engineerId);
  s = await action(request, 'clock', { time: stop.start + 5 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await page.getByLabel('Выбрать инженера').selectOption(engineer.id);
  await expect(page.locator('.phone .next-visit-label')).toContainText('НА ОБЪЕКТЕ');
  await page.locator('.phone').getByRole('button', { name: 'Перерыв 30 мин' }).click();
  await expect(page.locator('.phone-break')).toBeVisible();
  await page.locator('.phone').getByRole('button', { name: 'Завершить работу', exact: true }).click();
  await expect(
    page.locator('.phone').getByRole('button', { name: 'Завершить работу', exact: true }),
  ).toHaveCount(0);
  s = await (await request.get('/api/state')).json();
  expect(s.jobs.find((j) => j.id === stop.jobId).status).toBe('done');
  await page.getByRole('tab', { name: 'Диспетчер', exact: true }).click();
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Заявки/ })
    .click();
  await page.getByRole('row').filter({ hasText: 'Запланирована' }).first().click();
  await page.getByLabel('Отчёт инженера').fill('Нет доступа на объект');
  await page.getByRole('button', { name: 'Сообщить о проблеме' }).click();
  await expect(page.getByRole('dialog')).toContainText('Нужна помощь');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).first().click();
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Поддержка/ })
    .click();
  await expect(page.locator('.support-ticket')).toContainText('Нет доступа на объект');
  await page.getByRole('button', { name: 'Вернуть в планирование' }).click();
  await expect(page.locator('.support-ticket')).toContainText('Обработано');
});
test('overload, editing resources and invalid API inputs produce meaningful results', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await openHackathon(page);
  await page.getByRole('button', { name: 'Новый сценарий', exact: true }).click();
  await page.getByRole('button', { name: 'Высокая нагрузка' }).click();
  await page.getByRole('button', { name: 'Сгенерировать день' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let s = await (await request.get('/api/state')).json();
  expect(s.jobs).toHaveLength(35);
  expect(s.plan.unassigned.length).toBeGreaterThan(0);
  await page.goto('/');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Команда/ })
    .click();
  await page.getByRole('button', { name: 'Ресурсы', exact: true }).first().click();
  await page.getByLabel('Транспорт', { exact: true }).selectOption('none');
  await page.getByRole('button', { name: 'Сохранить и пересчитать' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  s = await (await request.get('/api/state')).json();
  expect(s.plan.routes[0].stops).toHaveLength(0);
  const res = await request.post('/api/action', {
    data: { type: 'job.save', payload: { ...s.jobs[0], lat: 'invalid' } },
  });
  expect(res.status()).toBe(400);
});
test('phone preview and narrow screen have no horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await expect(page.locator('.phone')).toBeVisible();
  await page.screenshot({ path: 'test-results/engineer-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.phone')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/engineer-mobile.png', fullPage: true });
});
test('batch arrival, edited windows and import/export work through the interface', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await openHackathon(page);
  await page.getByRole('button', { name: 'Случайные заявки', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить и перепланировать' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let s = await (await request.get('/api/state')).json();
  expect(s.jobs).toHaveLength(21);
  await page.goto('/');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Заявки/ })
    .click();
  await page.locator('tbody tr').first().click();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await page.getByLabel('Окно: с', { exact: true }).fill('08:00');
  await page.getByLabel('Начать до', { exact: true }).fill('08:01');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  s = await (await request.get('/api/state')).json();
  expect(s.jobs[0].windowEnd).toBe(481);
  expect(s.jobs[0].engineerId).toBeNull();
  const exported = await (await request.get('/api/export')).json();
  await openHackathon(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await page.getByRole('button', { name: 'Заменить сценарий' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  s = await (await request.get('/api/state')).json();
  expect(s.jobs).toHaveLength(21);
  expect(s.time).toBe(480);
});

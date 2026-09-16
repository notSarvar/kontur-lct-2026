import { test, expect } from '@playwright/test';
async function act(request, type, payload = {}) {
  const response = await request.post('/api/action', { data: { type, payload } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
test('official regions, synthetic staff and mandatory metrics work in the dispatcher UI', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await act(request, 'dataset.load', { id: 'southcenter' });
  await page.goto('/');
  await expect(page.locator('.dataset-banner')).toContainText('56 заявок');
  await page.getByRole('button', { name: 'Данные Билайн', exact: true }).click();
  await page.getByLabel('Участок', { exact: true }).selectOption('east');
  await page.getByRole('button', { name: 'Загрузить участок', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.dataset-banner')).toContainText('66 заявок');
  await expect(page.locator('.dataset-banner')).toContainText('Точка офиса предварительная');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Аналитика/ })
    .click();
  await expect(page.getByRole('heading', { name: 'ALNS и базовый алгоритм' })).toBeVisible();
  await expect(page.locator('.analytics-grid table').first()).toContainText('Первый доступный');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Команда/ })
    .click();
  await page.getByRole('button', { name: 'Добавить инженера', exact: true }).click();
  await page.getByLabel('Имя инженера').fill('Резерв');
  await page.getByRole('button', { name: 'Сохранить и пересчитать', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Резерв', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('dispatcher resolves an emergency-displaced request and the audit survives reload', async ({
  page,
  request,
}) => {
  let s = await act(request, 'generate', { count: 1, engineerCount: 1, seed: 42 });
  const job = {
    ...s.jobs[0],
    skills: ['local'],
    type: 'local',
    title: 'Плановый визит',
    priority: 'normal',
    lat: s.engineers[0].home.lat,
    lng: s.engineers[0].home.lng,
    windowStart: 540,
    windowEnd: 540,
    duration: 60,
  };
  s = await act(request, 'import', { jobs: [job], engineers: s.engineers });
  const original = s.jobs[0].id;
  s = await act(request, 'job.save', { ...job, id: undefined, title: 'Срочный выезд', priority: 'urgent' });
  expect(s.jobs.find((j) => j.id === original).status).toBe('manual_review');
  await page.goto('/');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Поддержка/ })
    .click();
  await page.getByRole('button', { name: 'Согласовать заявку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Окно не меняется автоматически');
  await page.getByLabel('Окно: с', { exact: true }).fill('12:00');
  await page.getByLabel('Начать до', { exact: true }).fill('14:00');
  await page
    .getByLabel('Результат согласования', { exact: true })
    .fill('Клиент подтвердил 12–14 по телефону');
  await page.getByRole('button', { name: 'Подтвердить и перепланировать', exact: true }).click();
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  s = await (await request.get('/api/state')).json();
  expect(s.jobs.find((j) => j.id === original).status).toBe('pending');
  expect(s.history.findLast((h) => h.type === 'job.rescheduled').before.windowEnd).toBe(540);
  await page.reload();
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Заявки/ })
    .click();
  await page.getByRole('row').filter({ hasText: 'Плановый визит' }).click();
  await expect(page.getByRole('dialog')).toContainText('Исходное окно: 09:00–09:00');
  await expect(page.getByRole('dialog')).toContainText('Клиент подтвердил');
});

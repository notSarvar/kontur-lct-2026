import { test, expect } from '@playwright/test';
async function act(request, type, payload = {}) {
  const r = await request.post('/api/action', { data: { type, payload } });
  expect(r.ok()).toBeTruthy();
  return r.json();
}
test('ordinary manual reassignment supports cancel, apply, pin and stale preview protection', async ({
  page,
  request,
}) => {
  let s = await act(request, 'generate', { count: 2, engineerCount: 2, seed: 7 });
  const home = s.engineers[0].home;
  s = await act(request, 'import', {
    jobs: s.jobs.map((j) => ({
      ...j,
      ...home,
      skills: ['local'],
      equipment: [],
      priority: 'normal',
      windowStart: 540,
      windowEnd: 1200,
    })),
    engineers: s.engineers.map((e) => ({ ...e, skills: ['local'], home })),
  });
  const job = s.jobs[0],
    target = s.engineers.find((e) => e.id !== job.engineerId);
  await page.goto('/');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Заявки/ })
    .click();
  await page
    .getByRole('row')
    .filter({ hasText: String(job.number) })
    .click();
  await page.getByRole('button', { name: 'Переназначить', exact: true }).click();
  await page.getByLabel('Новый исполнитель').selectOption(target.id);
  await page.getByRole('button', { name: 'Проверить переназначение' }).click();
  await expect(page.getByRole('dialog')).toContainText('Другой инженер');
  await expect(page.getByLabel('Сводка изменений')).toContainText('Изменится');
  await expect(page.getByLabel('Маршруты на карте')).toHaveValue('changed');
  await page.getByLabel('Маршруты на карте').selectOption('all');
  await page.getByLabel('Маршруты на карте').selectOption('changed');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.preview-body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole('button', { name: 'Отменить изменения' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Применить план' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1100 });
  let current = await (await request.get('/api/state')).json();
  expect(current.revision).toBe(s.revision);
  await page.getByRole('button', { name: 'Отменить изменения' }).click();
  current = await (await request.get('/api/state')).json();
  expect(current.jobs[0].engineerId).toBe(job.engineerId);
  await page
    .getByRole('row')
    .filter({ hasText: String(job.number) })
    .click();
  await page.getByRole('button', { name: 'Переназначить', exact: true }).click();
  await page.getByLabel('Новый исполнитель').selectOption(target.id);
  await page.getByRole('button', { name: 'Проверить переназначение' }).click();
  await page.getByRole('button', { name: 'Применить план' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  current = await (await request.get('/api/state')).json();
  expect(current.jobs[0].pinnedEngineerId).toBe(target.id);
  await page.getByRole('button', { name: 'Настройки расчёта', exact: true }).click();
  await page.getByLabel('Цель планирования').selectOption('emergency');
  await page.getByRole('button', { name: 'Применить и пересчитать', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Аварийное реагирование');
  await act(request, 'job.note', { id: job.id, text: 'Изменение в другой вкладке' });
  await expect(page.getByRole('button', { name: 'Применить план' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('План изменился');
});

test('prepared walking data and attention jobs work without a routing provider', async ({
  page,
  request,
}) => {
  await act(request, 'dataset.load', { id: 'east' });
  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  const issue = page.locator('.attention-item').first();
  await expect(issue).toBeVisible();
  await issue.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  let s = await act(request, 'settings', { roadMode: 'prepared', mode: 'economy', stability: true });
  expect(s.plan.roadSource).toBe('prepared');
  expect(s.plan.matrixId).toBeTruthy();
  expect(
    s.plan.routes.flatMap((r) => r.stops).some((stop) => stop.travelMode === 'foot' && !stop.estimated),
  ).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Пересчитать план', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('FOSSGIS');
  await expect(page.getByRole('button', { name: 'Применить план' })).toBeEnabled();
  await page.getByRole('button', { name: 'Отменить изменения' }).click();
  await act(request, 'settings', { roadMode: 'estimate', mode: 'economy', stability: true });
});

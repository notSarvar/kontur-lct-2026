import { openHackathon } from './workspaces.js';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const r = await request.post('/api/action', {
    data: { type: 'generate', payload: { seed: 42, count: 8, engineerCount: 3 } },
  });
  expect(r.ok()).toBeTruthy();
  const s = await r.json();
  await request.post('/api/action', {
    data: {
      type: 'settings',
      payload: {
        ...s.settings,
        solver: 'alns',
        alnsIterations: 60,
        alnsRestarts: 1,
        ortoolsSeconds: 3,
        balanceWork: true,
      },
    },
  });
});
test.afterEach(async ({ request }) => {
  const s = await (await request.get('/api/state')).json();
  await request.post('/api/action', {
    data: {
      type: 'settings',
      payload: { ...s.settings, solver: 'alns', alnsIterations: 60, alnsRestarts: 1 },
    },
  });
});
test('workload analytics and historical work inputs are readable on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Нагрузка инженеров' })).toBeVisible();
  await expect(page.locator('.workload-panel tbody tr')).toHaveCount(3);
  await page.getByLabel('Период метрик инженеров').selectOption('past');
  await expect(page.locator('.workload-panel tbody tr').first()).toContainText('Нет данных');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByLabel('Раздел приложения').selectOption('team');
  await page.getByRole('button', { name: 'Ресурсы', exact: true }).first().click();
  await page.getByLabel('Период истории').fill('Вчера');
  await page.getByLabel('Доступное время смен, мин').fill('540');
  await page.getByLabel('Работал на объектах, мин').fill('450');
  await page.getByRole('button', { name: 'Сохранить и пересчитать', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test('SOP checklist survives reload and template edits preserve copies', async ({ page, request }) => {
  let state = await (await request.get('/api/state')).json();
  await request.post('/api/action', {
    data: { type: 'simulation.checklists', payload: { enabled: false, expectedRevision: state.revision } },
  });
  const job = state.jobs.find((j) => j.sop && j.status === 'pending');
  expect(job).toBeTruthy();
  await page.goto('/');
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Заявки/ })
    .click();
  await page
    .locator('tr')
    .filter({ hasText: `#${job.number}` })
    .click();
  await expect(page.getByRole('heading', { name: 'Регламент работ', exact: true })).toBeVisible();
  await page.getByLabel('Условия применения подтверждены').click();
  await expect(page.getByLabel('Условия применения подтверждены')).toBeChecked();
  const step = page.locator('.sop-checklist input').first();
  await expect(step).toBeEnabled();
  await step.click();
  await expect(step).toBeChecked();
  await page.getByRole('button', { name: 'Изменить чек-лист', exact: true }).click();
  await page.getByLabel('Название регламента').fill('Мой регламент выезда');
  await page.getByRole('button', { name: 'Сохранить регламент', exact: true }).click();
  await expect(page.locator('.sop-editor')).toHaveCount(0);
  await expect(page.locator('.sop-checklist input').first()).toBeChecked();
  state = await (await request.get('/api/state')).json();
  expect(state.jobs.find((j) => j.id === job.id).duration).toBe(job.duration);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.reload();
  await page.getByLabel('Раздел приложения').selectOption('jobs');
  await page
    .locator('tr')
    .filter({ hasText: `#${job.number}` })
    .click();
  await expect(page.getByRole('heading', { name: 'Мой регламент выезда', exact: true })).toBeVisible();
  await expect(page.locator('.sop-checklist input').first()).toBeChecked();
});
test('selecting real OR-Tools previews the plan and comparison does not mutate it', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Настройки расчёта', exact: true }).click();
  await expect(page.getByText(/OR-Tools .* подключён локально/)).toBeVisible();
  await page.getByLabel('Алгоритм расчёта').selectOption('ortools');
  await page.getByLabel('Бюджет OR-Tools, секунд').fill('3');
  await page.getByRole('button', { name: 'Применить и пересчитать' }).click();
  await expect(page.getByRole('dialog')).toContainText('Применить');
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const before = await (await request.get('/api/state')).json();
  expect(before.plan.solver).toBe('ortools');
  await openHackathon(page);
  await page.getByRole('button', { name: 'Сравнить алгоритмы', exact: true }).click();
  await expect(page.locator('.solver-comparison tbody tr')).toHaveCount(3);
  await expect(page.locator('.solver-comparison')).toContainText('CP-SAT');
  const after = await (await request.get('/api/state')).json();
  expect(after.revision).toBe(before.revision);
  expect(after.plan).toEqual(before.plan);
});

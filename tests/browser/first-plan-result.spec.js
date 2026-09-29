import { test, expect } from '@playwright/test';
async function generate(request, seed = 42) {
  const response = await request.post('/api/action', {
    data: { type: 'generate', payload: { count: 8, engineerCount: 2, seed } },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
const notice = (page) => page.getByRole('complementary', { name: 'Результат первого расчёта' });

test('shows actual first result, opens the graph and remembers acknowledgement across reloads', async ({
  page,
  request,
}, testInfo) => {
  const state = await generate(request);
  await page.goto('/');
  await expect(notice(page)).toBeVisible();
  const result = state.firstPlanResult;
  await expect(notice(page)).toContainText(`${Math.round((result.assigned / result.total) * 100)}%`);
  await expect(notice(page)).toContainText(`${result.assigned} из ${result.total}`);
  await expect(notice(page).locator('dd').first()).toHaveText(String(result.unassigned));
  await notice(page).screenshot({ path: testInfo.outputPath('first-plan-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(notice(page)).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('first-plan-mobile.png') });
  await page.getByRole('button', { name: 'Проверить план', exact: true }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('.timeline-row')).toHaveCount(state.engineers.length);
  expect(await (await request.get('/api/state')).json()).toEqual(state);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Диспетчер', exact: true })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  await generate(request, 43);
  await expect(notice(page)).toBeVisible();
});

test('does not overlap dialogs, appear in engineer mode or repeat after subsequent replanning', async ({
  page,
  request,
}) => {
  const state = await generate(request);
  await page.goto('/');
  await expect(notice(page)).toBeVisible();
  await page.getByRole('button', { name: 'Настройки расчёта', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(notice(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Диспетчер', exact: true }).click();
  await expect(notice(page)).toBeVisible();
  const response = await request.post('/api/action', { data: { type: 'optimize', payload: {} } });
  expect(response.ok()).toBeTruthy();
  const next = await response.json();
  expect(next.firstPlanResult).toEqual(state.firstPlanResult);
  await expect(notice(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Диспетчер', exact: true })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});

test('closing is synchronized between tabs, and hackathon never shows the dispatcher notice', async ({
  page,
  context,
  request,
}) => {
  await generate(request);
  await page.goto('/');
  await expect(notice(page)).toBeVisible();
  const second = await context.newPage();
  await second.goto('/');
  await expect(notice(second)).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть результаты расчёта' }).click();
  await expect(notice(second)).toHaveCount(0);
  await generate(request, 45);
  await page.goto('/hackathon');
  await expect(page.getByRole('heading', { name: 'Пульт демонстрации', exact: true })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});

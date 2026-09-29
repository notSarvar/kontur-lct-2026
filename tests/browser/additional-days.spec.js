import { test, expect } from '@playwright/test';
test('all six additional datasets load independently through the existing interface', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const entries = [
    ['east-day2', 74, '2026-09-28'],
    ['east-day3', 78, '2026-09-29'],
    ['southeast-day2', 87, '2026-09-29'],
    ['southeast-day3', 102, '2026-09-28'],
    ['southcenter-day2', 77, '2026-09-28'],
    ['southcenter-day3', 79, '2026-09-28'],
  ];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/hackathon');
  for (const [id, count, date] of entries) {
    await page.getByRole('button', { name: 'Данные Билайн', exact: true }).click();
    await expect(page.getByLabel('Участок', { exact: true }).locator('option')).toHaveCount(9);
    await page.getByLabel('Участок', { exact: true }).selectOption(id);
    await expect(page.getByRole('dialog')).toContainText('Это самостоятельный сценарий');
    await page.getByRole('button', { name: 'Загрузить участок', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.dataset-banner')).toContainText(`${count} заявок`);
    const s = await (await request.get('/api/state')).json();
    expect(s.dataset.id).toBe(id);
    expect(s.dataset.date).toBe(date);
    expect(s.jobs).toHaveLength(count);
    expect(s.jobs.every((j) => j.id.startsWith(id + ':'))).toBeTruthy();
    expect(s.jobs.some((j) => j.status === 'done' || j.status === 'cancelled')).toBeFalsy();
    expect(s.plan.metrics.assigned + s.plan.metrics.unassigned).toBe(count);
    if (count === 102) {
      const exported = await (await request.get('/api/export')).json();
      const imported = await request.post('/api/action', { data: { type: 'import', payload: exported } });
      expect(imported.ok()).toBeTruthy();
      expect((await imported.json()).jobs).toHaveLength(102);
    }
  }
  await page.reload();
  await expect(page.locator('.dataset-banner')).toContainText('Югоцентр · день 3');
  await page.getByRole('button', { name: 'Данные Билайн', exact: true }).click();
  await page.getByLabel('Участок', { exact: true }).selectOption('east');
  await page.getByRole('button', { name: 'Загрузить участок', exact: true }).click();
  await expect(page.locator('.dataset-banner')).toContainText('66 заявок');
  expect(errors).toEqual([]);
});

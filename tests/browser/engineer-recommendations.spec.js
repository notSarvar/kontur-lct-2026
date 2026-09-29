import { test, expect } from '@playwright/test';
const action = async (request, type, payload) => {
  const res = await request.post('/api/action', { data: { type, payload } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
};
test.beforeEach(async ({ request }) => {
  const s = await action(request, 'generate', { seed: 42, count: 1, engineerCount: 4 });
  await action(request, 'import', {
    engineers: s.engineers.map((e) => ({ ...e, skills: ['local'], shiftStart: 480, shiftEnd: 1380 })),
    jobs: [
      {
        ...s.jobs[0],
        sop: undefined,
        type: 'local',
        skills: ['local'],
        title: 'Срочный ремонт',
        priority: 'urgent',
        lat: s.engineers[0].home.lat + 0.01,
        lng: s.engineers[0].home.lng,
        windowStart: 480,
        windowEnd: 480,
        duration: 30,
      },
    ],
  });
});
async function openApproval(page) {
  await page.goto('/');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /^Поддержка/ })
    .click();
  await page.getByRole('button', { name: 'Согласовать заявку' }).click();
  await expect(page.getByRole('region', { name: 'Автоподбор инженеров' })).toBeVisible();
}
test('suggestions recalculate from edited windows and never assign until dispatcher confirms preview', async ({
  page,
  request,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const before = await (await request.get('/api/state')).json();
  await openApproval(page);
  await expect(page.locator('.recommendations-empty')).toContainText('Нет подходящего варианта');
  await page.getByLabel('Начать до', { exact: true }).fill('12:00');
  await expect(page.locator('.recommendation-card')).toHaveCount(3);
  await expect(page.locator('.engineer-recommendations')).toContainText('Показаны 3 из 4');
  const chosen = page.locator('.recommendation-card').nth(1);
  const name = await chosen.locator('h4').textContent();
  await chosen.getByRole('button').click();
  const selected = await page.getByLabel('Назначить инженера', { exact: true }).inputValue();
  expect(before.engineers.find((e) => e.id === selected).name).toBe(name);
  expect(await (await request.get('/api/state')).json()).toEqual(before);
  await page
    .locator('.engineer-recommendations')
    .screenshot({ path: testInfo.outputPath('three-engineers.png') });
  await page.getByLabel('Результат согласования').fill('Клиент подтвердил окно до 12:00');
  await page.getByRole('button', { name: 'Подтвердить и перепланировать' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Предпросмотр изменений');
  expect(await (await request.get('/api/state')).json()).toEqual(before);
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await (await request.get('/api/state')).json();
  expect(after.jobs[0].engineerId).toBe(selected);
  expect(after.jobs[0].pinnedEngineerId).toBe(selected);
  expect(after.jobs[0].status).toBe('pending');
  expect(errors).toEqual([]);
});
test('resources invalidate suggestions, fewer than three are honest, cards fit mobile', async ({
  page,
  request,
}, testInfo) => {
  let s = await (await request.get('/api/state')).json();
  for (const e of s.engineers.slice(1))
    s = await action(request, 'engineer.save', { ...e, skills: ['emergency'] });
  await openApproval(page);
  await page.getByLabel('Начать до', { exact: true }).fill('12:00');
  await expect(page.locator('.recommendation-card')).toHaveCount(1);
  await expect(page.locator('.engineer-recommendations')).toContainText('Подходящих инженеров: 1 из 4');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.engineer-recommendations').scrollIntoViewIfNeeded();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('recommendations-mobile.png') });
  await page.getByLabel('Тестер', { exact: true }).click();
  await expect(page.locator('.recommendation-card')).toHaveCount(0);
  await expect(page.locator('.recommendations-empty')).toBeVisible();
});
test('API rejects stale state without changing assignments and UI surfaces a calculation failure', async ({
  page,
  request,
}) => {
  const s = await (await request.get('/api/state')).json();
  const response = await request.post('/api/engineer-recommendations', {
    data: { expectedRevision: s.revision - 1, job: s.jobs[0] },
  });
  expect(response.status()).toBe(409);
  expect(await (await request.get('/api/state')).json()).toEqual(s);
  await page.route('**/api/engineer-recommendations', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Расчёт временно недоступен' }),
    }),
  );
  await openApproval(page);
  await expect(page.getByRole('alert')).toContainText('Расчёт временно недоступен');
  await page.unroute('**/api/engineer-recommendations');
  await page.getByRole('button', { name: 'Повторить подбор' }).click();
  await expect(page.locator('.recommendations-empty')).toBeVisible();
});

test('each candidate has a readable Gantt with feasible windows and responsive details', async ({
  page,
  request,
}, testInfo) => {
  const s = await (await request.get('/api/state')).json();
  await action(request, 'import', {
    engineers: s.engineers,
    jobs: [
      s.jobs[0],
      ...s.engineers.slice(0, 3).map((e, i) => ({
        ...s.jobs[0],
        id: `planned-${i}`,
        title: 'Плановый ремонт',
        priority: 'normal',
        lat: e.home.lat,
        lng: e.home.lng,
        pinnedEngineerId: e.id,
        windowStart: 700,
        windowEnd: 900,
        duration: 60,
      })),
    ],
  });
  const before = await (await request.get('/api/state')).json();
  await openApproval(page);
  await page.getByLabel('Начать до', { exact: true }).fill('20:00');
  await expect(page.locator('.recommendation-card')).toHaveCount(3);
  await expect(page.locator('.recommendation-gantt')).toHaveCount(3);
  for (const chart of await page.locator('.recommendation-gantt').all()) {
    await expect(chart).toContainText('Текущий план');
    await expect(chart).toContainText('Со срочной заявкой');
    await expect(chart.locator('.urgent[role=img]')).toHaveCount(1);
    expect(await chart.locator('.available[role=img]').count()).toBeGreaterThan(0);
  }
  const first = page.locator('.recommendation-gantt').first();
  await first.locator('.urgent[role=img]').focus();
  await expect(first.locator('.recommendation-gantt-detail')).toContainText('Срочная заявка');
  await first.locator('summary').click();
  await expect(first.locator('details')).toContainText('Это время начала');
  await page
    .locator('.engineer-recommendations')
    .screenshot({ path: testInfo.outputPath('gantt-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await first.scrollIntoViewIfNeeded();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await first.screenshot({ path: testInfo.outputPath('gantt-mobile.png') });
  expect(await (await request.get('/api/state')).json()).toEqual(before);
});

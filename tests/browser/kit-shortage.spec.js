import { test, expect } from '@playwright/test';
async function action(request, type, payload = {}) {
  const s = await (await request.get('/api/state')).json();
  const r = await request.post('/api/action', {
    data: { type, payload: { ...payload, expectedRevision: s.revision } },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
test.beforeEach(async ({ request }) => {
  await action(request, 'simulation.checklists', { enabled: true });
  const s = await action(request, 'generate', { seed: 42, count: 2, engineerCount: 2 });
  await action(request, 'import', {
    engineers: s.engineers.map((e) => ({
      ...e,
      skills: ['local', 'connection'],
      equipment: [],
      shiftStart: 480,
      shiftEnd: 1080,
      home: s.engineers[0].home,
    })),
    jobs: s.jobs.map((j, i) => ({
      ...j,
      sop: undefined,
      type: i ? 'local' : 'connection',
      skills: [i ? 'local' : 'connection'],
      title: i ? 'Проверка линии' : 'Подключение клиента',
      equipment: [],
      requiredTransport: 'any',
      priority: 'normal',
      lat: s.engineers[0].home.lat,
      lng: s.engineers[0].home.lng,
      windowStart: 540,
      windowEnd: 1020,
      duration: 30,
      pinnedEngineerId: s.engineers[0].id,
    })),
  });
});
for (const decision of ['confirm', 'skip', 'withdraw'])
  test(`material shortage: ${decision}, sync and preview safety`, async ({
    page,
    context,
    request,
  }, testInfo) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
    await page.getByRole('button', { name: 'Пройти вручную', exact: true }).click();
    await expect(page.locator('.phone h2')).toHaveText('Сбор на смену');
    const boxes = page.locator('.phone input[type=checkbox]');
    const count = await boxes.count();
    for (let i = 1; i < count; i++) {
      await boxes.nth(i).click();
      await expect(page.locator('.engineer-simulation-mode button')).toBeEnabled();
    }
    await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect(page.getByText('Не все материалы указаны', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Выехать на объект', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Не хватает материалов, отправить', exact: true }).click();
    await expect(page.getByText('Маршрут под риском — ожидайте решения', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
    await expect(page.getByText('Маршрут под риском — ожидайте решения', { exact: true })).toBeVisible();
    const d = await context.newPage();
    await d.goto('/');
    await d
      .locator('.sidebar nav')
      .getByRole('button', { name: /^Поддержка/ })
      .click();
    await d.getByRole('button', { name: 'Разобрать недостачу', exact: true }).click();
    const dialog = d.getByRole('dialog');
    await expect(dialog).toContainText('Медный кабель');
    await expect(dialog).toContainText('Затронутые заявки · 1');
    await dialog.screenshot({ path: testInfo.outputPath(`shortage-${decision}.png`) });
    const before = await (await request.get('/api/state')).json();
    if (decision === 'confirm') {
      await d.getByRole('button', { name: 'Материалы есть — подтвердить', exact: true }).click();
      await expect(page.locator('.phone h2')).toHaveText('Ближайшая работа');
      expect((await (await request.get('/api/state')).json()).plan).toEqual(before.plan);
    } else {
      await d
        .getByRole('button', {
          name: decision === 'skip' ? 'Отложить затронутые заявки' : 'Снять со смены и пересчитать',
          exact: true,
        })
        .click();
      await expect(d.getByRole('dialog', { name: 'Предпросмотр изменений' })).toBeVisible();
      expect(await (await request.get('/api/state')).json()).toEqual(before);
      await d.getByRole('button', { name: 'Отменить изменения', exact: true }).click();
      expect(await (await request.get('/api/state')).json()).toEqual(before);
      await d.getByRole('button', { name: 'Разобрать недостачу', exact: true }).click();
      await d
        .getByRole('button', {
          name: decision === 'skip' ? 'Отложить затронутые заявки' : 'Снять со смены и пересчитать',
          exact: true,
        })
        .click();
      await d.getByRole('button', { name: 'Применить план', exact: true }).click();
      await expect(d.getByRole('dialog')).toHaveCount(0);
      if (decision === 'withdraw')
        await expect(page.getByText('Вы сняты со смены', { exact: true })).toBeVisible();
      else await expect(page.locator('.phone h2')).toHaveText('Ближайшая работа');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await d.close();
  });

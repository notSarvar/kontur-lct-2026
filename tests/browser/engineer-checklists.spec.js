import { test, expect } from '@playwright/test';

async function action(request, type, payload = {}) {
  const current = await (await request.get('/api/state')).json();
  const res = await request.post('/api/action', {
    data: { type, payload: { ...payload, expectedRevision: current.revision } },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}
test.beforeEach(async ({ request }) => {
  await action(request, 'simulation.checklists', { enabled: true });
  const s = await action(request, 'generate', { seed: 42, count: 2, engineerCount: 1 });
  await action(request, 'import', {
    engineers: s.engineers,
    jobs: s.jobs.map((j) => ({
      ...j,
      sop: undefined,
      type: 'connection',
      title: 'Подключение клиента',
      skills: ['connection'],
      lat: s.engineers[0].home.lat,
      lng: s.engineers[0].home.lng,
      windowStart: 540,
      windowEnd: 1000,
      duration: 70,
    })),
  });
});
test('automatic checklists keep the presentation flowing and are visible on the phone', async ({
  page,
  request,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await expect(page.locator('.phone')).toContainText('Комплект собран');
  await page.getByRole('button', { name: /Комплект собран/ }).click();
  const boxes = page.locator('.phone input[type=checkbox]');
  expect(await boxes.count()).toBeGreaterThan(0);
  for (const box of await boxes.all()) {
    await expect(box).toBeChecked();
    await expect(box).toBeDisabled();
  }
  await page.locator('.phone').screenshot({ path: testInfo.outputPath('auto-kit.png') });
  await page.getByRole('button', { name: 'Перейти к работам' }).click();
  await action(request, 'clock', { time: 545 });
  await expect(page.locator('.phone')).toContainText('Работа на объекте');
  for (const box of await boxes.all()) await expect(box).toBeChecked();
  await page.locator('.phone').screenshot({ path: testInfo.outputPath('auto-work.png') });
  const s = await action(request, 'clock', { time: 1000 });
  expect(s.jobs.every((j) => j.status === 'done')).toBeTruthy();
  await expect(page.locator('.phone')).toContainText('Все выезды позади');
});
test('manual checklist, early arrival, SOP, result and events work across reload and clients', async ({
  page,
  request,
  context,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await page.getByRole('button', { name: 'Пройти вручную' }).click();
  await expect(page.locator('.phone h2')).toHaveText('Сбор на смену');
  await expect(page.getByRole('button', { name: 'Выехать на объект' })).toHaveCount(0);
  await page.locator('.phone input[type=checkbox]').first().click();
  await expect(page.locator('.phone input[type=checkbox]').first()).toBeChecked();
  await page.reload();
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await expect(page.locator('.phone input[type=checkbox]').first()).toBeChecked();
  await page.locator('.phone').screenshot({ path: testInfo.outputPath('manual-kit.png') });
  while (await page.locator('.phone input[type=checkbox]:not(:checked)').count()) {
    const box = page.locator('.phone input[type=checkbox]:not(:checked)').first();
    await box.click();
    await expect(page.locator('.engineer-simulation-mode button')).toBeEnabled();
  }
  await expect(page.getByRole('button', { name: 'Выехать на объект' })).toBeVisible();
  await page.getByRole('button', { name: /Порядок дня/ }).click();
  await expect(page.locator('.engineer-order-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Назад к визиту' }).click();
  await page.getByRole('button', { name: 'Выехать на объект' }).click();
  await page.getByRole('button', { name: 'Позвонить', exact: true }).click();
  await expect(page.locator('.phone')).toContainText('Звонок выполняется');
  await page.getByRole('button', { name: 'Понятно' }).click();
  await page.getByRole('button', { name: 'Я на месте' }).click();
  await expect(page.getByRole('button', { name: 'Начать можно с 09:00' })).toBeDisabled();
  await action(request, 'clock', { time: 540 });
  await page.getByRole('button', { name: 'Начать работу', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить визит' }).click();
  await page.getByRole('button', { name: /^Всё выполнено/ }).click();
  await expect(page.getByRole('button', { name: 'Подтвердить и завершить' })).toBeDisabled();
  await page.getByRole('button', { name: 'Назад к визиту' }).click();
  for (const box of await page.locator('.phone input[type=checkbox]').all()) {
    await box.click();
    await expect(page.locator('.engineer-simulation-mode button')).toBeEnabled();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('.phone').screenshot({ path: testInfo.outputPath('manual-work-mobile.png') });
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await second.locator('.phone-nav').getByRole('button', { name: 'События' }).click();
  await page.getByRole('button', { name: 'Завершить визит' }).click();
  await page.getByRole('button', { name: /^Всё выполнено/ }).click();
  await page.getByRole('button', { name: 'Подтвердить и завершить' }).click();
  await expect(page.locator('.phone h2')).toHaveText('Визит закрыт');
  await expect(second.locator('.phone-events')).toContainText('Результат визита получен');
  await page.getByRole('button', { name: 'Перейти к следующей работе' }).click();
  await expect(page.locator('.phone h2')).toHaveText('Ближайшая работа');
  expect(errors).toEqual([]);
});

test('current visit map, demo contact, HTTP copying and map link keep the visit unchanged', async ({
  page,
  request,
  context,
}, testInfo) => {
  const original = await (await request.get('/api/state')).json();
  await action(request, 'import', {
    engineers: original.engineers,
    jobs: original.jobs.map((job, i) => ({
      ...job,
      lat: job.lat + (i ? 0.02 : 0.01),
      address: i ? 'Будущий адрес' : 'Текущий адрес',
    })),
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  // The dispatcher still sees every planned stop.
  await expect(page.locator('.job-pin-wrap')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await page.getByRole('button', { name: 'Выехать на объект', exact: true }).click();
  await expect(page.locator('.phone h2')).toHaveText('В пути');
  await expect(page.locator('.phone .job-pin-wrap')).toHaveCount(1);
  await expect(page.locator('.phone .engineer-pin-wrap')).toHaveCount(1);
  // An estimated approach has two points; no future leg is left in the polyline.
  const path = await page.locator('.phone path.leaflet-interactive').getAttribute('d');
  expect((path.match(/L/g) || []).length).toBe(1);
  await expect(page.locator('.engineer-job-card')).toContainText('+7 ххх хх хх');
  await expect(page.locator('.engineer-job-card')).toContainText('демо');
  await page.getByRole('button', { name: 'Скопировать', exact: true }).click();
  await expect(page.locator('.engineer-client-phone [role=status]')).toHaveText('Номер скопирован');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('+7 ххх хх хх');
  // Exercise the HTTP path too, using the real browser clipboard via execCommand.
  await page.evaluate(() => {
    window.readClipboard = navigator.clipboard.readText.bind(navigator.clipboard);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await page.getByRole('button', { name: 'Скопировать', exact: true }).click();
  expect(await page.evaluate(() => window.readClipboard())).toBe('+7 ххх хх хх');
  const before = await (await request.get('/api/state')).json();
  const current = before.jobs.find((j) => j.status === 'enroute');
  const maps = page.getByRole('link', { name: 'Открыть в картах', exact: true });
  await expect(maps).toHaveAttribute(
    'href',
    `https://www.openstreetmap.org/?mlat=${current.lat}&mlon=${current.lng}#map=17/${current.lat}/${current.lng}`,
  );
  await expect(page.getByRole('button', { name: 'Маршрут и контакты' })).toHaveCount(0);
  // Prevent contacting the external map provider during the test.
  await context.route('https://www.openstreetmap.org/**', (route) =>
    route.fulfill({ body: 'Карта текущей заявки' }),
  );
  const popup = context.waitForEvent('page');
  await maps.click();
  await (await popup).close();
  await page.getByRole('button', { name: 'Позвонить', exact: true }).click();
  await expect(page.locator('.phone')).toContainText('Звонок выполняется');
  await page.getByRole('button', { name: 'Понятно' }).click();
  expect(await (await request.get('/api/state')).json()).toEqual(before);
  await page.locator('.phone').screenshot({ path: testInfo.outputPath('enroute-contact.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('.phone').screenshot({ path: testInfo.outputPath('enroute-contact-mobile.png') });
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
import { openHackathon } from './workspaces.js';

// These scenarios replace the day. Always use an isolated TEST_URL.
test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/action', {
    data: { type: 'generate', payload: { seed: 42, count: 18, engineerCount: 4 } },
  });
  expect(response.ok()).toBeTruthy();
});

async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    const overflow = await dialog.locator('input, select, textarea, button').evaluateAll((controls) =>
      controls
        .filter((el) => {
          if (!el.getClientRects().length) return false;
          const box = el.getBoundingClientRect();
          const parent = el.closest('[role="dialog"]').getBoundingClientRect();
          return box.left < parent.left - 1 || box.right > parent.right + 1;
        })
        .map((el) => el.getAttribute('aria-label') || el.textContent || el.outerHTML.slice(0, 100)),
    );
    expect(overflow).toEqual([]);
  }
}

async function shot(page, testInfo, name) {
  await fits(page);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: !(await page.getByRole('dialog').count()),
  });
}

async function close(page) {
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
}

async function navigate(page, section) {
  if (await page.getByLabel('Раздел приложения').isVisible()) {
    await page.getByLabel('Раздел приложения').selectOption(section);
  } else {
    const names = {
      overview: 'Обзор',
      jobs: 'Заявки',
      team: 'Команда',
      analytics: 'Аналитика',
      support: 'Поддержка',
      settings: 'Настройки расчёта',
    };
    await page
      .locator('.sidebar')
      .getByRole('button', { name: new RegExp(`^${names[section]}`) })
      .click();
  }
}

for (const width of [1440, 390, 320]) {
  test(`all product sections and nested dialogs work at ${width}px`, async ({ page, request }, testInfo) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const before = await (await request.get('/api/state')).json();
    await page.goto('/');
    await shot(page, testInfo, 'overview');
    await page.getByRole('button', { name: 'Уведомления', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('События рабочего дня');
    await shot(page, testInfo, 'notifications');
    await close(page);

    await page.getByRole('button', { name: /Время в пути:/ }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Как рассчитано время в пути');
    await page.getByRole('dialog').getByRole('button', { name: 'Настройки расчёта', exact: true }).click();
    await shot(page, testInfo, 'settings');
    await page.getByRole('button', { name: 'Шаблоны работ', exact: true }).click();
    await shot(page, testInfo, 'templates');
    await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).first().click();
    await shot(page, testInfo, 'template-editor');
    const steps = await page.locator('.sop-step-edit').count();
    await page.getByRole('button', { name: 'Добавить шаг', exact: true }).click();
    await expect(page.locator('.sop-step-edit')).toHaveCount(steps + 1);
    await page.getByRole('button', { name: 'Удалить шаг', exact: true }).last().click();
    await expect(page.locator('.sop-step-edit')).toHaveCount(steps);
    await page.getByRole('button', { name: 'Отменить правки', exact: true }).click();
    await close(page);

    await navigate(page, 'jobs');
    await page.getByPlaceholder('Адрес, номер или тип работ').fill('несуществующий адрес');
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await page.getByPlaceholder('Адрес, номер или тип работ').fill('');
    const values = await page
      .getByLabel('Фильтр заявок')
      .locator('option')
      .evaluateAll((options) => options.map((o) => o.value));
    for (const value of values) {
      await page.getByLabel('Фильтр заявок').selectOption(value);
      await fits(page);
    }
    await page.getByLabel('Фильтр заявок').selectOption('all');
    await shot(page, testInfo, 'jobs');
    await page.getByRole('button', { name: 'Новая заявка', exact: true }).click();
    await shot(page, testInfo, 'new-job');
    await close(page);
    await page.locator('tbody tr').first().click();
    await shot(page, testInfo, 'job');
    await page.getByRole('button', { name: 'Переназначить', exact: true }).click();
    await shot(page, testInfo, 'assignment');
    await page.getByLabel('Новый исполнитель').selectOption('');
    await page.getByRole('button', { name: 'Проверить переназначение' }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Предпросмотр изменений');
    await shot(page, testInfo, 'preview');
    await page.getByRole('button', { name: 'Отменить изменения' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('tbody tr').first().click();
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    await shot(page, testInfo, 'edit-job');
    await close(page);

    await navigate(page, 'team');
    await page.getByLabel('Найти инженера', { exact: true }).fill('нет такого инженера');
    await expect(page.getByText('Инженер не найден')).toBeVisible();
    await page.getByLabel('Найти инженера', { exact: true }).fill('');
    await shot(page, testInfo, 'team');
    await page.getByRole('button', { name: 'Добавить инженера', exact: true }).click();
    await shot(page, testInfo, 'new-engineer');
    await close(page);
    await page.getByRole('button', { name: 'Ресурсы', exact: true }).first().click();
    await shot(page, testInfo, 'engineer-resources');
    await close(page);
    await page
      .getByRole('button', { name: /^Открыть приложение:/ })
      .first()
      .click();
    for (const title of ['События', 'Профиль', 'Маршрут']) {
      await page.locator('.phone-nav').getByRole('button', { name: title, exact: true }).click();
      await shot(page, testInfo, `engineer-${title}`);
    }
    await page.getByLabel('Выбрать инженера').selectOption(before.engineers[1].id);
    await page.getByRole('button', { name: 'Открыть заявку', exact: true }).click();
    await shot(page, testInfo, 'engineer-job');
    await close(page);
    await page.getByRole('tab', { name: 'Диспетчер', exact: true }).click();
    await navigate(page, 'analytics');
    for (const value of ['projected', 'past', 'remaining']) {
      await page.getByLabel('Период метрик инженеров').selectOption(value);
      await fits(page);
    }
    await shot(page, testInfo, 'analytics');
    await navigate(page, 'support');
    await shot(page, testInfo, 'support');
    await navigate(page, 'settings');
    await close(page);
    const after = await (await request.get('/api/state')).json();
    expect(after.revision).toBe(before.revision);
    expect(after.plan).toEqual(before.plan);
    expect(errors).toEqual([]);
  });

  test(`demo dialogs, map picker, import and export work at ${width}px`, async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openHackathon(page);
    await page.getByRole('button', { name: 'Данные Билайн', exact: true }).click();
    await shot(page, testInfo, 'dataset');
    await page.getByLabel('Участок').selectOption('southcenter');
    await page.getByRole('button', { name: 'Загрузить участок', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const before = await (await request.get('/api/state')).json();
    await page.getByRole('button', { name: /^География:/ }).click();
    await shot(page, testInfo, 'geography');
    await close(page);
    await page.getByRole('button', { name: 'Офис участка', exact: true }).click();
    const lat = await page.getByLabel('Широта офиса').inputValue();
    await page.locator('.picker-map .leaflet-container').click({ position: { x: 100, y: 100 } });
    await expect(page.getByLabel('Широта офиса')).not.toHaveValue(lat);
    await shot(page, testInfo, 'office');
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    for (const [button, title] of [
      ['Случайные заявки', 'Поток новых заявок'],
      ['Новый сценарий', 'Новый рабочий день'],
      ['Срочная заявка', 'Новая заявка'],
      ['Как это работает', 'Рабочий прототип, открытая модель'],
    ]) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveAccessibleName(title);
      await shot(page, testInfo, button);
      await close(page);
    }
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспорт JSON', exact: true }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Импорт', exact: true }).click();
    await (await picker).setFiles(path);
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Загрузить сценарий?');
    await shot(page, testInfo, 'import');
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await expect(page.getByRole('status')).toContainText('Не удалось прочитать JSON');
    await page.getByRole('button', { name: 'Скрыть уведомление' }).click();
    const after = await (await request.get('/api/state')).json();
    expect(after.revision).toBe(before.revision);
    expect(after.plan).toEqual(before.plan);
    expect(errors).toEqual([]);
  });
}

test('SOP steps can be added on a plain HTTP deployment without randomUUID', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window.crypto, 'randomUUID', { value: undefined }));
  await page.goto('/');
  await navigate(page, 'settings');
  await page.getByRole('button', { name: 'Шаблоны работ', exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).first().click();
  const steps = await page.locator('.sop-step-edit').count();
  await page.getByRole('button', { name: 'Добавить шаг', exact: true }).click();
  await expect(page.locator('.sop-step-edit')).toHaveCount(steps + 1);
  await page.getByLabel(`Шаг ${steps + 1}`, { exact: true }).fill('Дополнительная проверка');
  await page.getByRole('button', { name: 'Сохранить регламент', exact: true }).click();
  await expect(page.locator('.sop-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).first().click();
  await expect(page.getByLabel(`Шаг ${steps + 1}`, { exact: true })).toHaveValue('Дополнительная проверка');
});

test('map controls, team cards, creation, validation and deletion remain connected', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('.leaflet-control-zoom-in').click();
  await page.locator('.leaflet-control-zoom-out').click();
  await page.getByRole('button', { name: 'Развернуть расписание' }).click();
  await page.locator('.leaflet-control-zoom-in').click();
  await close(page);
  await page.getByRole('button', { name: 'Развернуть все', exact: true }).click();
  await page.getByRole('button', { name: 'Карточка инженера', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Ресурсы инженера');
  await close(page);
  await page.locator('.compact-stop').first().click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName(/Заявка №/);
  await close(page);
  await page.getByRole('button', { name: 'Свернуть все', exact: true }).click();
  await expect(page.locator('.compact-route-body')).toHaveCount(0);
  await page.getByRole('button', { name: 'Как это работает', exact: true }).click();
  await page.locator('.modal-shade').click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await navigate(page, 'team');
  await page.getByRole('button', { name: 'Добавить инженера', exact: true }).click();
  await page.getByLabel('Имя инженера').fill('Тестовый инженер');
  await page.getByLabel('Смена до').fill('07:00');
  await page.getByRole('button', { name: 'Сохранить и пересчитать' }).click();
  await expect(page.locator('.toast.error')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Смена до').fill('20:00');
  await page.getByRole('button', { name: 'Скрыть уведомление' }).click();
  await page.getByRole('button', { name: 'Сохранить и пересчитать' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.team-member')).toHaveCount(5);
  await page.getByRole('button', { name: 'Открыть приложение: Тестовый инженер', exact: true }).click();
  await page.locator('.phone-nav').getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: 'Перерыв на 30 минут', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Вернуться с перерыва', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться с перерыва', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Перерыв на 30 минут', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Диспетчер', exact: true }).click();
  await navigate(page, 'jobs');
  const state = await (await request.get('/api/state')).json();
  const job = state.jobs[0];
  await page
    .locator('tbody tr')
    .filter({ hasText: `#${job.number}` })
    .click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Предпросмотр изменений');
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(state.jobs.length - 1);
  const after = await (await request.get('/api/state')).json();
  expect(after.jobs.some((j) => j.id === job.id)).toBe(false);
  expect(errors).toEqual([]);
});

test('geography confirmation previews safely and simulation controls advance the clock', async ({
  page,
  request,
}) => {
  await request.post('/api/action', { data: { type: 'dataset.load', payload: { id: 'east' } } });
  await page.goto('/');
  await page.getByRole('button', { name: /Проверить адреса/ }).click();
  const before = await (await request.get('/api/state')).json();
  await page.getByLabel('Широта здания').fill('55.75');
  await page.getByLabel('Долгота здания').fill('37.62');
  await page.getByLabel('Источник подтверждения').fill('Тестовая точка для проверки предпросмотра');
  await page.getByRole('button', { name: 'Проверить план с этой точкой' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Предпросмотр изменений');
  await page.getByRole('button', { name: 'Отменить изменения' }).click();
  const unchanged = await (await request.get('/api/state')).json();
  expect(unchanged.jobs).toEqual(before.jobs);
  expect(unchanged.revision).toBe(before.revision);
  await openHackathon(page);
  await page.getByLabel('Скорость симуляции').selectOption('15');
  await page.getByRole('button', { name: 'Запустить симуляцию', exact: true }).click();
  await expect(page.locator('.simulation-clock')).toContainText('08:15');
  await page.getByRole('button', { name: 'Пауза симуляции', exact: true }).click();
  await expect(page.locator('.simulation-clock')).toContainText('На паузе');
  await page.getByRole('button', { name: '+30 мин', exact: true }).click();
  await expect(page.locator('.simulation-clock')).toContainText('08:45');
  const after = await (await request.get('/api/state')).json();
  expect(after.time).toBe(525);
});

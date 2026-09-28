import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/action', {
    data: { type: 'generate', payload: { seed: 42, count: 18, engineerCount: 4 } },
  });
  expect(response.ok()).toBeTruthy();
});

async function openSopJob(page, request) {
  const state = await (await request.get('/api/state')).json();
  const job = state.jobs.find((job) => job.sop && job.status === 'pending');
  await page.goto('/');
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Заявки/ })
    .click();
  await page
    .locator('tbody tr')
    .filter({ hasText: `#${job.number}` })
    .click();
  return job;
}

test('header actions align with the content on desktop, tablet and wide monitors', async ({ page }) => {
  await page.goto('/');
  for (const width of [2560, 1920, 1440, 1280, 1024, 820]) {
    await page.setViewportSize({ width, height: 1000 });
    const avatar = await page.locator('.user-avatar').boundingBox();
    const panel = await page.getByRole('region', { name: 'Сводка дня' }).boundingBox();
    expect(
      Math.abs(avatar.x + avatar.width - panel.x - panel.width),
      `right edge at ${width}px`,
    ).toBeLessThanOrEqual(1);
  }
});

test('long map tooltips keep a readable width on desktop and mobile', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('.map-canvas').scrollIntoViewIfNeeded();
    const index = await page.locator('.job-pin-wrap').evaluateAll((markers) =>
      markers.findIndex((el) => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    await page.locator('.job-pin-wrap').nth(index).hover();
    const tooltip = page.locator('.leaflet-tooltip');
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    expect(box.width).toBeGreaterThan(180);
    expect(box.width).toBeLessThanOrEqual(282);
    expect(box.height).toBeLessThan(150);
    await page.screenshot({ path: testInfo.outputPath(`tooltip-${width}.png`) });
    await page.mouse.move(0, 0);
  }
});

test('checklist editing opens visibly, returns to its trigger and preserves a report draft', async ({
  page,
  request,
}, testInfo) => {
  const job = await openSopJob(page, request);
  await page.getByLabel('Отчёт инженера').fill('Черновик отчёта — не терять при редактировании');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Изменить чек-лист', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Изменить чек-лист');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByLabel('Название регламента')).toBeFocused();
    await expect(page.getByLabel('Название регламента')).toBeInViewport();
    await expect(page.getByLabel('Отчёт инженера')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`checklist-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveAccessibleName(`Заявка №${job.number}`);
    await expect(page.getByRole('button', { name: 'Изменить чек-лист', exact: true })).toBeFocused();
    await expect(page.getByLabel('Отчёт инженера')).toHaveValue(
      'Черновик отчёта — не терять при редактировании',
    );
  }
});

test('empty report is unavailable without a busy cursor; saving only shows while the request is pending', async ({
  page,
  request,
}) => {
  await openSopJob(page, request);
  const button = page.getByRole('button', { name: 'Сохранить отчёт', exact: true });
  await expect(button).toBeDisabled();
  expect(await button.evaluate((el) => getComputedStyle(el).cursor)).not.toMatch(/wait|progress/);
  await expect(button).not.toHaveAttribute('aria-busy', 'true');
  await page.getByLabel('Отчёт инженера').fill('Отчёт из проверки состояний кнопки');
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/action', async (route) => {
    if (route.request().postDataJSON().type === 'job.note') await pending;
    await route.continue();
  });
  await button.click();
  const saving = page.getByRole('button', { name: 'Сохраняем отчёт…', exact: true });
  await expect(saving).toHaveAttribute('aria-busy', 'true');
  await expect(saving).toBeDisabled();
  release();
  await expect(page.locator('.job-note')).toContainText('Отчёт из проверки состояний кнопки');
  await expect(button).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByLabel('Отчёт инженера')).toHaveValue('');
});

test('geography keeps fields beside the map and actions visible, then stacks on mobile', async ({
  page,
  request,
}, testInfo) => {
  await request.post('/api/action', { data: { type: 'dataset.load', payload: { id: 'east' } } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /Проверить адреса/ }).click();
  const fields = await page.locator('.geography-fields').boundingBox();
  const map = await page.locator('.geography-map').boundingBox();
  expect(map.x).toBeGreaterThan(fields.x + fields.width);
  expect(Math.abs(map.y - fields.y)).toBeLessThan(2);
  await expect(page.getByLabel('Источник подтверждения')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Проверить план с этой точкой' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('geography-desktop.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  const mobileFields = await page.locator('.geography-fields').boundingBox();
  const mobileMap = await page.locator('.geography-map').boundingBox();
  expect(mobileMap.y).toBeGreaterThan(mobileFields.y + mobileFields.height);
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Проверить план с этой точкой' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('geography-mobile.png') });
});

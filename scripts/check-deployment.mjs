// Checks an existing deployment without applying changes or resetting its data.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const baseURL = process.env.DEPLOY_URL;
if (!baseURL) throw new Error('Set DEPLOY_URL to the deployed site origin.');
const output = process.env.DEPLOY_SCREENSHOTS;
if (output) await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const beforeResponse = await page.request.get(`${baseURL}/api/state`);
  assert(beforeResponse.ok());
  const before = await beforeResponse.json();
  const optimizers = await (await page.request.get(`${baseURL}/api/optimizers`)).json();
  assert.equal(optimizers.ortools.available, true);

  const stream = await fetch(`${baseURL}/api/events`, { signal: AbortSignal.timeout(5000) });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /connected/);
  await reader.cancel();

  await page.goto(baseURL);
  await expect(page.getByRole('region', { name: 'Сводка дня' })).toBeVisible();
  await expect(page.locator('.topbar .metric-link')).toHaveCount(0);
  const avatar = await page.locator('.user-avatar').boundingBox();
  const summary = await page.getByRole('region', { name: 'Сводка дня' }).boundingBox();
  assert(
    Math.abs(avatar.x + avatar.width - summary.x - summary.width) <= 1,
    'Header and content edges must align.',
  );
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await expect(page.locator('.timeline-row')).toHaveCount(before.engineers.length);
  await page.locator('.gantt-job').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await page.getByRole('button', { name: 'Пересчитать план', exact: true }).click();
  await expect(page.getByLabel('Сводка изменений')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Отменить изменения' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  if (output) await page.screenshot({ path: `${output}/desktop.png` });
  const sopJob = before.jobs.find((job) => job.sop && job.status !== 'done');
  if (sopJob) {
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /^Заявки/ })
      .click();
    await page.getByPlaceholder('Адрес, номер или тип работ').fill(String(sopJob.number));
    await page
      .locator('tbody tr')
      .filter({ hasText: `#${sopJob.number}` })
      .first()
      .click();
    if (output) await page.screenshot({ path: `${output}/job.png` });
    const report = page.getByRole('button', { name: 'Сохранить отчёт', exact: true });
    assert.equal(await report.evaluate((el) => getComputedStyle(el).cursor), 'not-allowed');
    await page.getByRole('button', { name: 'Изменить чек-лист', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Изменить чек-лист');
    await expect(page.getByLabel('Название регламента')).toBeInViewport();
    if (output) await page.screenshot({ path: `${output}/checklist.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveAccessibleName(`Заявка №${sopJob.number}`);
    await page.keyboard.press('Escape');
    await page.locator('.sidebar').getByRole('button', { name: 'Обзор дня', exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Раздел приложения')).toBeVisible();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (output) await page.screenshot({ path: `${output}/mobile.png` });
  for (const section of ['jobs', 'team', 'analytics', 'support', 'settings']) {
    await page.getByLabel('Раздел приложения').selectOption(section);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.getByRole('button', { name: 'Шаблоны работ', exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).first().click();
  const steps = await page.locator('.sop-step-edit').count();
  await page.getByRole('button', { name: 'Добавить шаг', exact: true }).click();
  await expect(page.locator('.sop-step-edit')).toHaveCount(steps + 1);
  await page.getByRole('button', { name: 'Удалить шаг', exact: true }).last().click();
  await expect(page.locator('.sop-step-edit')).toHaveCount(steps);
  await page.getByRole('button', { name: 'Отменить правки', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  for (const title of ['События', 'Профиль', 'Мой день']) {
    await page.locator('.phone-nav').getByRole('button', { name: title, exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.goto(`${baseURL}/hackathon`);
  await expect(page).toHaveTitle('Контур — пульт хакатона');
  await expect(page.getByRole('heading', { name: 'Пульт демонстрации' })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Открыть продукт' })).toHaveAttribute(
    'href',
    before.workspace.productUrl,
  );
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (output) await page.screenshot({ path: `${output}/hackathon-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Настройки расчёта', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.simulation')).toBeVisible();
  if (output) await page.screenshot({ path: `${output}/hackathon.png` });
  const after = await (await page.request.get(`${baseURL}/api/state`)).json();
  assert.equal(after.revision, before.revision, 'The shared day changed during the check.');
  assert.deepEqual(after.jobs, before.jobs);
  assert.deepEqual(after.plan, before.plan);
  assert.deepEqual(after.sopTemplates, before.sopTemplates);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        url: baseURL,
        dataset: before.dataset?.name,
        jobs: before.jobs.length,
        engineers: before.engineers.length,
        revision: before.revision,
        ortools: optimizers.ortools,
        sse: true,
        browser:
          'desktop, mobile, all sections, SOP editor and public hackathon console passed; preview cancelled; state unchanged',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

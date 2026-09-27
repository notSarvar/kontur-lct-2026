// Run against a disposable server with its own DATA_DIR: this resets its demo day.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const baseURL = process.env.TEST_URL || 'http://127.0.0.1:4330';
if (new URL(baseURL).port === '4317')
  throw new Error('Use a separate test server, not the working day on 4317.');
const output = new URL('../screenshots/reference-ui-2026-09-27/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.request.post(`${baseURL}/api/action`, {
    data: { type: 'dataset.load', payload: { id: 'east' } },
  });
  if (!response.ok()) throw new Error(await response.text());
  await page.goto(baseURL);
  await page.locator('.map-canvas').waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [360, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const fits = await page.evaluate(() => {
      const header = document.querySelector('.topbar');
      return document.documentElement.scrollWidth <= innerWidth && header.scrollWidth <= innerWidth;
    });
    if (!fits) throw new Error(`Layout overflows at ${width}px`);
  }
  const capture = async (name, locator, fullPage = true) => {
    await page
      .waitForFunction(
        () => [...document.querySelectorAll('.leaflet-tile')].every((tile) => tile.complete),
        null,
        { timeout: 8000 },
      )
      .catch(() => {});
    await page.waitForTimeout(800);
    await (locator || page).screenshot({
      path: new URL(name, output).pathname,
      ...(locator ? {} : { fullPage }),
    });
  };
  await capture('01-overview.png');
  await page.getByRole('button', { name: 'Развернуть расписание' }).click();
  await capture('02-expanded-map.png', page.getByRole('dialog'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await capture('03-timeline.png');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Заявки/ })
    .click();
  await capture('04-jobs.png');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Команда/ })
    .click();
  await capture('05-team.png');
  await page.getByRole('button', { name: 'Настройки расчёта', exact: true }).click();
  await page.getByLabel('Цель планирования').selectOption('emergency');
  await page.getByRole('button', { name: 'Применить и пересчитать', exact: true }).click();
  await page.getByLabel('Сводка изменений').waitFor();
  await capture('06-preview.png', page.getByRole('dialog'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.preview-body').evaluate((element) => {
    element.scrollTop = 0;
  });
  await capture('07-mobile-preview.png', null, false);
  await page.getByRole('button', { name: 'Отменить изменения' }).click();
  await page.getByLabel('Раздел приложения').selectOption('overview');
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await capture('08-mobile-overview.png');
  await page.getByLabel('Раздел приложения').selectOption('jobs');
  await capture('09-mobile-jobs.png');
  await page.getByRole('tab', { name: 'Инженер', exact: true }).click();
  await capture('10-engineer.png');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Saved 10 screenshots; no browser errors.');
} finally {
  await browser.close();
}

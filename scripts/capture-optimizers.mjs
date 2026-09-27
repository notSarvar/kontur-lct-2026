import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
const baseURL = process.env.TEST_URL || 'http://127.0.0.1:4317';
const directory = new URL('../screenshots/optimizers-2026-09-23/', import.meta.url);
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Аналитика', exact: true }).click();
  await page.locator('.workload-panel tbody tr').first().waitFor();
  await page.screenshot({ path: new URL('01-workload.png', directory).pathname, fullPage: true });
  await page.getByRole('button', { name: 'Настройки расчёта', exact: true }).click();
  await page.getByText(/OR-Tools .* подключён локально/).waitFor();
  await page.screenshot({ path: new URL('02-algorithm-settings.png', directory).pathname });
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  const state = await (await page.request.get(baseURL + '/api/state')).json();
  const job = state.jobs.find((j) => j.sop && j.status !== 'done');
  if (job) {
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /^Заявки/ })
      .click();
    await page
      .locator('tr')
      .filter({ hasText: `#${job.number}` })
      .click();
    await page.locator('.sop-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL('03-sop.png', directory).pathname });
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  }
  const { workspace } = await (await page.request.get(`${baseURL}/api/state`)).json();
  await page.goto(workspace.hackathonUrl);
  await page.locator('.simulation').waitFor();
  await page.getByRole('button', { name: 'Сравнить алгоритмы', exact: true }).click();
  await page.locator('.solver-comparison tbody tr').first().waitFor({ timeout: 90000 });
  await page
    .locator('.solver-comparison')
    .screenshot({ path: new URL('04-solver-comparison.png', directory).pathname });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(directory.pathname);
} finally {
  await browser.close();
}

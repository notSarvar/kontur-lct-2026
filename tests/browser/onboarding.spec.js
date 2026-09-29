import { test, expect } from '@playwright/test';
for (const mobile of [false, true])
  test(`operator onboarding ${mobile ? 'mobile' : 'desktop'} isolates the working day`, async ({
    page,
    request,
  }) => {
    test.setTimeout(100000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 });
    const before = await (await request.get('/api/state')).json();
    const unsafe = [];
    const errors = [];
    page.on('request', (r) => {
      if (
        new URL(r.url()).pathname.startsWith('/api/') &&
        !new URL(r.url()).pathname.startsWith('/api/onboarding/')
      )
        unsafe.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/onboarding');
    const tip = page.getByRole('region', { name: 'Обучение диспетчера' });
    const step = async (title) => {
      await expect(tip.getByRole('heading', { name: title, exact: true })).toBeVisible();
    };
    const next = async (name) => tip.getByRole('button', { name, exact: true }).click();
    await step('Знакомство с Контуром');
    await page.screenshot({ path: `/private/tmp/onboarding-${mobile ? 'mobile' : 'desktop'}-welcome.png` });
    await next('Начать обучение');
    await step('Весь день в трёх показателях');
    await page.locator('.dispatch-metrics button').first().click();
    await step('Весь день в трёх показателях');
    await next('Далее');
    await step('Карта маршрутов');
    await expect(page.locator('.onboarding-spotlight')).toBeVisible();
    await next('Посмотреть график');
    await step('Переключите вид расписания');
    await page.locator('[data-tour="graph"]').click();
    await step('Откройте заявку из плана');
    await page.locator('.gantt-job').first().click();
    await step('Проверьте условия визита');
    await next('К срочной заявке');
    await step('Перейдите в поддержку');
    if (mobile) await page.locator('.mobile-workspace-nav').selectOption('support');
    else await page.locator('[data-tour="nav-support"]').click();
    await step('Согласуйте срочный визит');
    await page.locator('[data-tour="urgent-approval"]').click();
    await step('Выберите инженера');
    await expect(page.locator('.recommendation-card')).toHaveCount(3);
    await expect(page.locator('.onboarding-wait')).toHaveCount(0);
    await page.screenshot({ path: `/private/tmp/onboarding-${mobile ? 'mobile' : 'desktop'}-recommend.png` });
    await page.locator('.recommendation-card .button').first().click();
    await step('Зафиксируйте договорённость');
    await expect(tip.getByRole('button', { name: 'Продолжить', exact: true })).toBeDisabled();
    await page.locator('.resolution-fields textarea').fill('Клиент подтвердил время');
    await next('Продолжить');
    await step('Рассчитайте новый вариант');
    await page.locator('.form-actions button[type="submit"]').click();
    await step('Проверьте изменения');
    await next('К подтверждению');
    await step('Примените учебный план');
    await page.getByRole('button', { name: 'Применить план', exact: true }).click();
    await step('Познакомьтесь с командой');
    if (mobile) await page.locator('.mobile-workspace-nav').selectOption('team');
    else await page.locator('[data-tour="nav-team"]').click();
    await step('Перейдём к приложению инженера');
    await next('К приложению инженера');
    await step('Откройте приложение инженера');
    await page.locator('[data-tour="engineer-mode"]').click();
    await step('Проверьте комплект на смену');
    await page.locator('.engineer-kit-summary').click();
    await step('Чек-лист по регламенту');
    await next('Посмотреть выезд');
    await step('Инженер на выезде');
    await expect(page.getByText('Выезд отмечен', { exact: true })).toBeVisible();
    await next('На объекте: SOP');
    await step('Отметьте выполненную работу');
    await expect(tip.getByRole('button', { name: 'Завершить обучение', exact: true })).toBeDisabled();
    await page.locator('.engineer-check:last-of-type input').click();
    await expect(page.locator('.engineer-check:last-of-type input')).toBeChecked();
    await expect(page.getByText(/Все пункты отмечены/)).toBeVisible();
    await page.screenshot({ path: `/private/tmp/onboarding-${mobile ? 'mobile' : 'desktop'}-sop.png` });
    await next('Завершить обучение');
    await step('Вы готовы к работе');
    await page.screenshot({ path: `/private/tmp/onboarding-${mobile ? 'mobile' : 'desktop'}-finish.png` });
    await next('Начать заново');
    await step('Знакомство с Контуром');
    expect(unsafe).toEqual([]);
    expect(errors).toEqual([]);
    expect(await (await request.get('/api/state')).json()).toEqual(before);
  });

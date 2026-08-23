const { test, expect } = require('@playwright/test');

const routes = [
  'dashboard',
  'today',
  'chat',
  'exams',
  'lectures',
  'todos',
  'modules',
  'links',
  'settings',
];

async function login(page) {
  await page.route('**/api/v1/mensa/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, meals: [] }),
  }));
  await page.goto('/login');
  await page.getByLabel('Passwort').fill('playwright-password');
  await Promise.all([
    page.waitForURL(/\/$/),
    page.getByRole('button', { name: 'Anmelden' }).click(),
  ]);
  await expect(page.locator('meta[name="csrf-token"]')).toHaveAttribute('content', /.+/);
  await page.evaluate(async () => {
    const csrf = document.querySelector('meta[name="csrf-token"]').content;
    const response = await fetch('/api/v1/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ onboardingCompleted: true, onboardingStep: 4 }),
    });
    if (!response.ok) throw new Error(`settings bootstrap failed: ${response.status}`);
  });
  await page.reload();
  await expect(page.locator('.main-content')).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
    && document.body.scrollWidth <= window.innerWidth
  ))).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('all application routes fit the viewport', async ({ page }) => {
  for (const route of routes) {
    await page.goto(`/${route}`);
    await expect(page.locator(`.page-${route}`)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('mobile bottom navigation, More menu, and browser history work', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('iphone-375'));
  await page.getByRole('button', { name: 'Heute', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole('button', { name: 'Aufgaben', exact: true }).click();
  await expect(page).toHaveURL(/\/todos$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);

  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Mehr' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('mobile dialog focuses content, closes on Escape, and restores focus', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('iphone-375'));
  const more = page.getByRole('button', { name: 'Mehr', exact: true });
  await more.focus();
  await more.click();
  const dialog = page.getByRole('dialog', { name: 'Mehr' });
  await expect(dialog.getByRole('button', { name: 'Dashboard' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(more).toBeFocused();
});

test('Todo core flow creates and completes a task', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('iphone-375'));
  await page.goto('/todos');
  const title = `Playwright Aufgabe ${Date.now()}`;
  await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).first().click();
  const input = page.getByPlaceholder('Aufgabentitel eingeben, Enter zum Speichern…');
  await input.fill(title);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Erledigen' }).first().click();
  await expect(page.getByText(title)).toHaveCSS('text-decoration-line', 'line-through');
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
});

test('Chat, exams, lectures, modules, and settings render without external services', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('iphone-375'));
  for (const route of ['chat', 'exams', 'lectures', 'modules', 'settings']) {
    await page.goto(`/${route}`);
    await expect(page.locator(`.page-${route}`)).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
  }
});

test('desktop sidebar exposes every primary route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const sidebar = page.locator('.desktop-sidebar');
  await expect(sidebar).toBeVisible();
  for (const label of ['Dashboard', 'Heute', 'KI-Assistent', 'Prüfungen', 'Vorlesungen', 'To-Dos', 'Module', 'TUM Links', 'Einstellungen']) {
    await expect(sidebar.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.locator('.mobile-tab-bar')).toBeHidden();
});

test('exam form labels are associated with their controls', async ({ page }) => {
  await page.goto('/exams');
  await page.getByRole('button', { name: 'Prüfung hinzufügen', exact: true }).click();
  for (const label of ['Fachname *', 'Datum *', 'Uhrzeit', 'Raum', 'ECTS', 'Notizen']) {
    const control = page.getByLabel(label, { exact: true });
    await expect(control).toHaveCount(1);
    await expect(control).toHaveAttribute('id', /.+/);
  }
});

test('icon actions have non-empty unique names and interactive controls are not nested', async ({ page }) => {
  for (const route of routes) {
    await page.goto(`/${route}`);
    await expect(page.locator('button button, [role="button"] button')).toHaveCount(0);
    const names = await page.locator('button.btn-icon:visible').evaluateAll(buttons => (
      buttons.map(button => button.getAttribute('aria-label') || '').filter(Boolean)
    ));
    expect(names).toHaveLength(new Set(names).size);
    await expect(page.locator('button.btn-icon:visible:not([aria-label])')).toHaveCount(0);
  }
});

test('theme follows the system until the user makes an explicit choice', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => localStorage.removeItem('theme'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Dunkel', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', '');
});

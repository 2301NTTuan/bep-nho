import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const API_BASE = 'http://localhost:3001/v1';
const runId = randomUUID().replace(/-/g, '');
const emailPrefix = `phase10-e2e-${runId}`;
const email = `${emailPrefix}@example.com`;
const deleteEmail = `${emailPrefix}-delete@example.com`;
const oldPassword = 'Phase10-browser-old!';
const newPassword = 'Phase10-browser-new!';
const prisma = new PrismaClient();

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations.filter((item) =>
    item.impact === 'serious' || item.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

async function latestMail(page: Page, targetEmail: string, type: 'email_verification' | 'password_reset') {
  const response = await page.request.get(
    `${API_BASE}/dev/mail-outbox/latest?email=${encodeURIComponent(targetEmail)}&type=${type}`,
  );
  expect(response.status()).toBe(200);
  return (await response.json() as { data: { token: string; url: string } }).data;
}

async function register(page: Page, targetEmail: string, password: string) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(targetEmail);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: /Tạo tài khoản/ }).click();
  await expect(page).toHaveURL('/');
}

test.afterAll(async () => {
  const credentials = await prisma.userCredential.findMany({
    where: { normalizedEmail: { startsWith: emailPrefix } },
    select: { userId: true },
  });
  await prisma.user.deleteMany({ where: { id: { in: credentials.map(({ userId }) => userId) } } });
  await prisma.$disconnect();
});

test('verification, sessions, and password recovery @e2e @a11y', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await register(page, email, oldPassword);
  await expect(page.getByText('Email của bạn chưa được xác minh.')).toBeVisible();

  const verification = await latestMail(page, email, 'email_verification');
  await page.goto(verification.url);
  await expect(page).toHaveURL(/\/account\?verified=1/, { timeout: 20_000 });
  await expect(page.getByText('Đã xác minh', { exact: true })).toBeVisible();
  await expectAccessible(page);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto('/login');
  await secondPage.getByLabel('Email').fill(email);
  await secondPage.getByLabel('Mật khẩu').fill(oldPassword);
  await secondPage.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(secondPage).toHaveURL('/');

  await page.reload();
  await expect(page.locator('.sessionList li')).toHaveCount(2);
  const revokeOthers = page.getByRole('button', { name: 'Thu hồi các phiên khác' });
  await revokeOthers.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Đã thu hồi 1 phiên khác.')).toBeVisible();
  const revokedStatus = await secondPage.evaluate(async (apiBase) => {
    const response = await fetch(`${apiBase}/me`, { credentials: 'include' });
    return response.status;
  }, API_BASE);
  expect(revokedStatus).toBe(401);
  await secondContext.close();

  await page.goto('/forgot-password');
  await expectAccessible(page);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Gửi liên kết đặt lại' }).click();
  await expect(page.getByText(/Nếu email có tài khoản/)).toBeVisible();
  const reset = await latestMail(page, email, 'password_reset');

  await page.goto('/reset-password');
  await expectAccessible(page);
  await page.goto(reset.url);
  await page.getByLabel('Mật khẩu mới').fill(newPassword);
  await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();
  await expect(page).toHaveURL(/\/login\?passwordReset=1/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(oldPassword);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.locator('.inlineError')).toContainText('Email hoặc mật khẩu chưa đúng.');
  await page.getByLabel('Mật khẩu').fill(newPassword);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/verify-email');
  await expectAccessible(page);
});

test('account deletion requires deliberate keyboard confirmation @e2e @a11y', async ({ page }) => {
  test.setTimeout(90_000);
  await register(page, deleteEmail, oldPassword);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Xóa tài khoản' })).toBeVisible();
  await page.getByLabel('Mật khẩu', { exact: true }).last().fill(oldPassword);
  await page.getByLabel('Nhập DELETE để xác nhận').fill('DELETE');
  const deleteButton = page.getByRole('button', { name: 'Xóa vĩnh viễn tài khoản' });
  await deleteButton.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
});

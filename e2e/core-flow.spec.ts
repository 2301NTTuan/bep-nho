import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const runId = randomUUID().replace(/-/g, '');
const emailPrefix = `phase9-e2e-${runId}`;
const email = `${emailPrefix}@example.com`;
const password = 'Phase9-browser-password!';
const prisma = new PrismaClient();

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations.filter((item) =>
    item.impact === 'serious' || item.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.afterAll(async () => {
  const credentials = await prisma.userCredential.findMany({
    where: { normalizedEmail: { startsWith: emailPrefix } },
    select: { userId: true },
  });
  const userIds = credentials.map((item) => item.userId);
  const profiles = await prisma.tasteProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const profileIds = profiles.map((item) => item.id);
  try {
    await prisma.userRecipePreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.personalizedAdjustmentDecision.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tasteControlEvent.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tasteSignal.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.cookFeedback.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookEvent.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.personalizedRecipeVersion.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tasteDimension.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.tasteProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

test('public → auth → cook → Taste DNA → best version @e2e @a11y', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Bếp Nhớ càng/ })).toBeVisible();
  const firstRecipe = page.locator('.recipeCard').first();
  await expect(firstRecipe).toBeVisible();
  await expectAccessible(page);

  await firstRecipe.click();
  await expect(page.locator('.detailHero h1')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /Đăng nhập để bắt đầu nấu/ })).toBeVisible();
  await expectAccessible(page);

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Tạo tài khoản Bếp Nhớ' })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: /Tạo tài khoản/ }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Taste DNA', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
  await page.goto('/login');
  await expectAccessible(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByLabel('Mật khẩu').press('Enter');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();

  const recipeLink = page.locator('.recipeCard').first();
  const recipeHref = await recipeLink.getAttribute('href');
  expect(recipeHref).toMatch(/^\/recipes\//);
  await recipeLink.click();
  const servingValue = page.locator('.servingPicker strong');
  const initialServings = Number((await servingValue.textContent())?.match(/\d+/)?.[0]);
  await page.getByRole('button', { name: '+' }).click();
  const selectedServings = initialServings + 1;
  await expect(servingValue).toHaveText(`${selectedServings} phần`);
  await page.getByRole('button', { name: 'Nấu bản chuẩn' }).click();
  await expect(page).toHaveURL(/\/cook\//, { timeout: 30_000 });
  await expect(page.getByText(`Đang nấu · ${selectedServings} phần`)).toBeVisible();
  await expectAccessible(page);

  const stepProgress = page.locator('.cookStepMeta > span');
  const stepProgressText = await stepProgress.textContent();
  const totalSteps = Number(stepProgressText?.match(/\/ (\d+)/)?.[1]);
  expect(totalSteps).toBeGreaterThan(0);
  const completeStep = page.getByRole('button', { name: /Xong bước này/ });
  const finish = page.getByRole('button', { name: /Hoàn thành món/ });
  for (let step = 1; step <= totalSteps; step += 1) {
    await expect(stepProgress).toHaveText(`Bước ${step} / ${totalSteps}`);
    await completeStep.click();
    if (step < totalSteps) {
      await expect(stepProgress).toHaveText(`Bước ${step + 1} / ${totalSteps}`, { timeout: 20_000 });
    } else {
      await expect(finish).toBeVisible({ timeout: 20_000 });
    }
  }
  await finish.click();

  await expect(page.getByRole('heading', { name: 'Món hôm nay thế nào?' })).toBeVisible();
  const saltiness = page.locator('fieldset').filter({ hasText: 'Độ mặn' });
  await saltiness.getByRole('button', { name: 'Hơi nhiều' }).click();
  await page.getByRole('button', { name: /Lưu phản hồi/ }).click();
  await expect(page.getByRole('heading', { name: 'Phiên bản tiếp theo đã sẵn sàng.' })).toBeVisible();

  await page.goto('/taste');
  await expect(page.getByRole('heading', { name: 'Khẩu vị của bạn, do bạn quyết định.' })).toBeVisible();
  await expect(page.getByText('Độ mặn', { exact: true }).first()).toBeVisible();
  await expectAccessible(page);
  const saltCard = page.locator('article').filter({ hasText: 'Độ mặn' }).first();
  await saltCard.locator('input[type="range"]').fill('0.7');
  await saltCard.getByRole('button', { name: 'Lưu ưu tiên' }).click();
  await expect(saltCard.getByText('Ưu tiên thủ công', { exact: true })).toBeVisible();
  await saltCard.getByRole('button', { name: 'Bỏ ưu tiên' }).click();
  await expect(saltCard.getByText('Đang học tự động', { exact: true })).toBeVisible();

  await page.goto(recipeHref!);
  const pin = page.getByRole('button', { name: 'Lưu làm bản tốt nhất' });
  await expect(pin).toBeVisible();
  await pin.click();
  await expect(page.getByText('Bản tốt nhất của bạn', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bỏ ghim bản tốt nhất' })).toBeVisible();
  await expect(page.getByText('Bản tốt nhất của bạn', { exact: true }).first()).toBeVisible();
});

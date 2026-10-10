import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const runId = randomUUID().replace(/-/g, '');
const emailPrefix = `phase15-mobile-${runId}`;
const email = `${emailPrefix}@example.com`;
const password = 'Phase15-mobile-password!';
const prisma = new PrismaClient();

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 2);
}

test.afterAll(async () => {
  const credentials = await prisma.userCredential.findMany({
    where: { normalizedEmail: { startsWith: emailPrefix } }, select: { userId: true },
  });
  const userIds = credentials.map((item) => item.userId);
  const memberships = await prisma.householdMember.findMany({
    where: { userId: { in: userIds } }, select: { householdId: true },
  });
  const householdIds = [...new Set(memberships.map((item) => item.householdId))];
  try {
    await prisma.householdShoppingListItem.deleteMany({ where: { shoppingList: { householdId: { in: householdIds } } } });
    await prisma.householdShoppingList.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdPantryItem.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMealPlanEntry.deleteMany({ where: { mealPlan: { householdId: { in: householdIds } } } });
    await prisma.householdMealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.cookFeedback.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookEvent.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

test('mobile alpha journey keeps core routes usable @e2e @a11y', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: /Tạo tài khoản/ }).click();
  await expect(page).toHaveURL('/');
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);

  const recipe = page.locator('.recipeCard').first();
  await expect(recipe).toBeVisible();
  await recipe.click();
  await expect(page.locator('.detailHero h1')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Nấu bản chuẩn' }).click();
  await expect(page).toHaveURL(/\/cook\//);
  await expect(page.getByText(/Đang nấu/)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/');
  await page.getByText('Điều hướng', { exact: true }).click();
  await page.getByRole('link', { name: 'Taste DNA', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Khẩu vị của bạn, do bạn quyết định.' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);

  await page.goto('/');
  await page.getByText('Điều hướng', { exact: true }).click();
  await page.getByRole('link', { name: 'Gia đình', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Khẩu vị chung của nhà mình' })).toBeVisible();
  await page.getByLabel('Tên gia đình').fill('Nhà mobile alpha');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await expect(page.getByRole('heading', { name: 'Nhà mobile alpha' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Kế hoạch bữa ăn', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kế hoạch bữa ăn' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tuần này chưa có kế hoạch' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('link', { name: '← Gia đình', exact: true }).click();
  await page.getByRole('link', { name: 'Kho bếp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kho bếp', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kho bếp đang trống' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);

  await page.getByRole('link', { name: '← Gia đình', exact: true }).click();
  await page.getByRole('link', { name: 'Danh sách đi chợ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Danh sách đi chợ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tuần này chưa có kế hoạch bữa ăn' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/');
  await page.getByText('Điều hướng', { exact: true }).click();
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tài khoản' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
});

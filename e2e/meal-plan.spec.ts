import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const runId = randomUUID().replace(/-/g, '');
const email = `phase13c1-${runId}@example.com`;
const password = 'Phase13C1-browser-password!';
const prisma = new PrismaClient();

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}
async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: /Tạo tài khoản/ }).click();
  await expect(page).toHaveURL('/');
}
function currentMonday() {
  const now = new Date(); const day = now.getUTCDay() || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1)).toISOString().slice(0, 10);
}

test.afterAll(async () => {
  const credentials = await prisma.userCredential.findMany({ where: { normalizedEmail: email }, select: { userId: true } });
  const userIds = credentials.map((item) => item.userId);
  const memberships = await prisma.householdMember.findMany({ where: { userId: { in: userIds } }, select: { householdId: true } });
  const householdIds = [...new Set(memberships.map((item) => item.householdId))];
  await prisma.householdMealPlanEntry.deleteMany({ where: { mealPlan: { householdId: { in: householdIds } } } });
  await prisma.householdMealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test('household meal planner supports manual planning, preview, stale recovery, and apply @e2e @a11y', async ({ page }) => {
  test.setTimeout(180_000);
  await register(page);
  await page.goto('/household');
  await page.getByLabel('Tên gia đình').fill('Nhà kế hoạch');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await page.getByRole('link', { name: 'Kế hoạch bữa ăn' }).click();
  await expect(page.getByRole('heading', { name: 'Kế hoạch bữa ăn' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tuần này chưa có kế hoạch' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Tạo kế hoạch tuần' }).click();
  await expect(page.getByText('Chủ động sắp xếp bữa ăn')).toBeVisible();

  await page.getByRole('button', { name: '+ Thêm bữa ăn' }).first().click();
  await expect(page.getByRole('heading', { name: 'Thêm bữa ăn' })).toBeVisible();
  await page.getByRole('button', { name: '← Tuần trước' }).click();
  await expect(page.getByRole('heading', { name: 'Tuần này chưa có kế hoạch' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thêm bữa ăn' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tuần sau →' }).click();
  await expect(page.getByText('Chủ động sắp xếp bữa ăn')).toBeVisible();
  await page.getByRole('button', { name: 'Về tuần hiện tại' }).click();
  await expect(page.getByText('Chủ động sắp xếp bữa ăn')).toBeVisible();

  await page.getByRole('button', { name: '+ Thêm bữa ăn' }).first().click();
  await page.getByLabel('Công thức').selectOption({ index: 1 });
  await page.getByLabel('Số phần').fill('3');
  await page.getByLabel('Ghi chú (không bắt buộc)').fill('Bữa cơm đầu tuần');
  await page.getByRole('button', { name: 'Thêm vào kế hoạch' }).click();
  await expect(page.getByText('3 phần · Bản chuẩn')).toBeVisible();
  await page.getByRole('button', { name: 'Sửa' }).first().click();
  await page.getByLabel('Số phần').fill('5');
  await page.getByLabel('Ghi chú (không bắt buộc)').fill('Đã đổi số phần');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('5 phần · Bản chuẩn')).toBeVisible();
  await expect(page.getByText('Đã đổi số phần')).toBeVisible();

  const checks = page.getByRole('checkbox', { name: 'Chọn để gợi ý' });
  await checks.nth(0).check(); await checks.nth(1).check();
  await page.getByRole('button', { name: 'Xem trước gợi ý' }).click();
  await expect(page.getByRole('heading', { name: 'Gợi ý trước khi áp dụng' })).toBeVisible();
  await expect(page.getByText('Các món dưới đây chưa được thêm vào kế hoạch.')).toBeVisible();
  await expect(page.getByText(/Việc chọn món ưu tiên sự đa dạng/)).toBeVisible();
  await expect(page.getByText(/Family Taste chỉ tinh chỉnh công thức/)).toBeVisible();

  const weekStart = currentMonday();
  const recipe = await prisma.recipe.findFirstOrThrow({ where: { status: 'published', versions: { some: { publishedAt: { not: null } } } }, include: { versions: { where: { publishedAt: { not: null } }, orderBy: { versionNo: 'desc' }, take: 1 } } });
  const credential = await prisma.userCredential.findUniqueOrThrow({ where: { normalizedEmail: email } });
  const membership = await prisma.householdMember.findUniqueOrThrow({ where: { userId: credential.userId } });
  const plan = await prisma.householdMealPlan.findUniqueOrThrow({
    where: { householdId_weekStart: { householdId: membership.householdId, weekStart: new Date(`${weekStart}T00:00:00.000Z`) } },
  });
  await prisma.householdMealPlanEntry.create({ data: { mealPlanId: plan.id, plannedDate: new Date(`${weekStart}T00:00:00.000Z`), mealType: 'lunch', recipeId: recipe.id, recipeVersionId: recipe.versions[0].id, servings: 4 } });
  await page.getByRole('button', { name: 'Áp dụng gợi ý' }).click();
  await expect(page.getByText('Kế hoạch hoặc Family Taste đã thay đổi. Hãy xem lại gợi ý mới.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo lại gợi ý' })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo lại gợi ý' }).click();
  await expect(page.getByRole('heading', { name: 'Gợi ý trước khi áp dụng' })).toBeVisible();
  await page.getByRole('button', { name: 'Áp dụng gợi ý' }).click();
  await expect(page.getByText('Đã áp dụng gợi ý cho kế hoạch tuần.')).toBeVisible();
  await expect(page.getByText('Family Taste', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Xóa khỏi kế hoạch' }).first().click();
  await expect(page.getByText('Đã xóa khỏi kế hoạch.')).toBeVisible();
  await expectAccessible(page);
});

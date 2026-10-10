import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const runId = randomUUID().replace(/-/g, '');
const email = `phase14b-e2e-${runId}@example.com`;
const password = 'Phase14B-browser-password!';
const ingredientSlug = `phase14b-pantry-${runId}`;
const ingredientName = `Nguyên liệu kho ${runId}`;
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

test.afterAll(async () => {
  const credential = await prisma.userCredential.findUnique({ where: { normalizedEmail: email }, select: { userId: true } });
  const userIds = credential ? [credential.userId] : [];
  const memberships = await prisma.householdMember.findMany({ where: { userId: { in: userIds } }, select: { householdId: true } });
  const householdIds = [...new Set(memberships.map((item) => item.householdId))];
  await prisma.householdShoppingListItem.deleteMany({ where: { shoppingList: { householdId: { in: householdIds } } } });
  await prisma.householdShoppingList.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdPantryItem.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdMealPlanEntry.deleteMany({ where: { mealPlan: { householdId: { in: householdIds } } } });
  await prisma.householdMealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
  await prisma.ingredient.deleteMany({ where: { slug: ingredientSlug } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test('household pantry adds, edits, resolves stale revisions, and deletes safely @e2e @a11y', async ({ page }) => {
  test.setTimeout(180_000);
  await prisma.ingredient.create({ data: { slug: ingredientSlug, canonicalName: ingredientName, category: 'produce' } });
  await register(page);
  await page.goto('/household');
  await page.getByLabel('Tên gia đình').fill('Nhà kho bếp');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await page.getByRole('link', { name: 'Kho bếp' }).click();
  await expect(page.getByRole('heading', { name: 'Kho bếp', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kho bếp đang trống' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Thêm nguyên liệu' }).first().click();
  await expect(page.getByRole('heading', { name: 'Thêm nguyên liệu' })).toBeVisible();
  await page.getByLabel('Tìm nguyên liệu chuẩn').fill(ingredientName);
  await page.getByRole('button', { name: 'Tìm' }).click();
  await page.getByRole('button', { name: new RegExp(ingredientName) }).click();
  await page.getByLabel('Số lượng').fill('500.25');
  await page.getByLabel('Đơn vị').fill('g');
  await page.getByLabel('Dùng tốt trước').fill('2026-10-20');
  await page.getByLabel('Ghi chú').fill('Ngăn mát');
  await page.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(page.getByText('Đã thêm nguyên liệu vào kho bếp.')).toBeVisible();
  await expect(page.getByText('500.25')).toBeVisible();
  await expect(page.getByText('Ngăn mát')).toBeVisible();

  await page.getByRole('button', { name: 'Sửa' }).click();
  await page.getByLabel('Số lượng').fill('420');
  await page.getByLabel('Ghi chú').fill('Đã kiểm tra');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Đã cập nhật kho bếp.')).toBeVisible();
  await expect(page.getByText('Đã kiểm tra')).toBeVisible();

  const item = await prisma.householdPantryItem.findFirstOrThrow({ where: { ingredient: { slug: ingredientSlug } } });
  await prisma.householdPantryItem.update({
    where: { id: item.id },
    data: { quantity: 777, note: 'Thành viên khác vừa cập nhật', revision: { increment: 1 } },
  });
  await page.getByRole('button', { name: 'Sửa' }).click();
  await page.getByLabel('Số lượng').fill('400');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Kho bếp vừa được thành viên khác cập nhật. Dữ liệu mới nhất đã được tải lại.')).toBeVisible();
  await expect(page.getByText('777')).toBeVisible();
  await expect(page.getByText('Thành viên khác vừa cập nhật')).toBeVisible();

  await page.getByRole('button', { name: 'Sửa' }).click();
  await page.getByLabel('Số lượng').fill('450');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('450')).toBeVisible();

  const freshItem = await prisma.householdPantryItem.findFirstOrThrow({ where: { ingredient: { slug: ingredientSlug } } });
  await prisma.householdPantryItem.update({
    where: { id: freshItem.id },
    data: { quantity: 333, note: 'Không được xóa bởi revision cũ', revision: { increment: 1 } },
  });
  await page.getByRole('button', { name: 'Xóa khỏi kho' }).click();
  await expect(page.getByText('Kho bếp vừa được thành viên khác cập nhật. Dữ liệu mới nhất đã được tải lại.')).toBeVisible();
  await expect(page.getByText('333')).toBeVisible();
  await expect(page.getByText('Không được xóa bởi revision cũ')).toBeVisible();

  await page.getByRole('button', { name: 'Xóa khỏi kho' }).click();
  await expect(page.getByText('Đã xóa nguyên liệu khỏi kho.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kho bếp đang trống' })).toBeVisible();
  await expectAccessible(page);
});

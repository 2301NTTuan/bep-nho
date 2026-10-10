import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const runId = randomUUID().replace(/-/g, '');
const email = `phase14c2-e2e-${runId}@example.com`;
const password = 'Phase14C2-browser-password!';
const recipeSlug = `phase14c2-shopping-${runId}`;
const recipeName = `Món đi chợ ${runId}`;
const matchedSlug = `phase14c2-match-${runId}`;
const mismatchedSlug = `phase14c2-mismatch-${runId}`;
const prisma = new PrismaClient();

function monday() { const now = new Date(); const day = now.getUTCDay() || 7; return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1)).toISOString().slice(0, 10); }
async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(result.violations, null, 2)).toEqual([]);
}
async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email); await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: /Tạo tài khoản/ }).click(); await expect(page).toHaveURL('/');
}

test.afterAll(async () => {
  const credential = await prisma.userCredential.findUnique({ where: { normalizedEmail: email }, select: { userId: true } });
  const userIds = credential ? [credential.userId] : [];
  const householdIds = [...new Set((await prisma.householdMember.findMany({ where: { userId: { in: userIds } }, select: { householdId: true } })).map((item) => item.householdId))];
  await prisma.householdShoppingListItem.deleteMany({ where: { shoppingList: { householdId: { in: householdIds } } } });
  await prisma.householdShoppingList.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdPantryItem.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdMealPlanEntry.deleteMany({ where: { mealPlan: { householdId: { in: householdIds } } } });
  await prisma.householdMealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
  await prisma.recipe.deleteMany({ where: { slug: recipeSlug } });
  await prisma.ingredient.deleteMany({ where: { slug: { in: [matchedSlug, mismatchedSlug] } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test('household shopping list previews, saves immutable snapshots, and recovers stale state @e2e @a11y', async ({ page }) => {
  test.setTimeout(180_000);
  const [matched, mismatched] = await Promise.all([
    prisma.ingredient.create({ data: { slug: matchedSlug, canonicalName: `Nguyên liệu khớp ${runId}`, category: 'rau củ' } }),
    prisma.ingredient.create({ data: { slug: mismatchedSlug, canonicalName: `Nguyên liệu khác đơn vị ${runId}`, category: 'gia vị' } }),
  ]);
  const recipe = await prisma.recipe.create({ data: { slug: recipeSlug, canonicalTitle: recipeName, status: 'published', versions: { create: { versionNo: 1, servings: 4, contentHash: `${'a'.repeat(48)}${runId.slice(0, 16)}`, publishedAt: new Date(), ingredients: { create: [
    { ingredientId: matched.id, quantity: 500, unit: 'g', sortOrder: 1 }, { ingredientId: mismatched.id, quantity: 500, unit: 'g', sortOrder: 2 },
  ] } } } }, include: { versions: true } });
  await register(page); await page.goto('/household');
  await page.getByLabel('Tên gia đình').fill('Nhà danh sách đi chợ'); await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await page.getByRole('link', { name: 'Kế hoạch bữa ăn' }).click(); await page.getByRole('button', { name: 'Tạo kế hoạch tuần' }).click();
  await page.getByRole('button', { name: '+ Thêm bữa ăn' }).first().click();
  await page.getByLabel('Công thức').selectOption({ label: recipeName }); await page.getByRole('button', { name: 'Thêm vào kế hoạch' }).click();
  const credential = await prisma.userCredential.findUniqueOrThrow({ where: { normalizedEmail: email } });
  const membership = await prisma.householdMember.findUniqueOrThrow({ where: { userId: credential.userId } });
  await prisma.householdPantryItem.createMany({ data: [
    { householdId: membership.householdId, ingredientId: matched.id, quantity: 300, unit: 'g', createdByUserId: credential.userId, updatedByUserId: credential.userId },
    { householdId: membership.householdId, ingredientId: mismatched.id, quantity: 1, unit: 'kg', createdByUserId: credential.userId, updatedByUserId: credential.userId },
  ] });
  await page.getByRole('link', { name: 'Tạo danh sách đi chợ' }).click();
  await expect(page.getByRole('heading', { name: 'Danh sách đi chợ' })).toBeVisible(); await expectAccessible(page);
  await page.getByRole('button', { name: 'Xem nguyên liệu cần mua' }).click();
  await expect(page.getByRole('heading', { name: 'Nguyên liệu cần mua' })).toBeVisible();
  await expect(page.getByText('Kho đã có:').first()).toContainText('300 g');
  await expect(page.getByText(/Kho đang có nguyên liệu này theo đơn vị khác/)).toBeVisible();
  expect(await prisma.householdShoppingList.count({ where: { householdId: membership.householdId } })).toBe(0);
  await page.getByRole('button', { name: 'Lưu danh sách đi chợ' }).click();
  await expect(page.getByText('Đã lưu danh sách đi chợ.')).toBeVisible(); await expect(page.getByText('Danh sách đã lưu · Phiên bản 1')).toBeVisible();
  await page.reload(); await expect(page.getByText('Danh sách đã lưu · Phiên bản 1')).toBeVisible();

  await page.getByRole('button', { name: 'Xem lại theo kế hoạch và kho hiện tại' }).click();
  await expect(page.getByRole('heading', { name: 'Nguyên liệu cần mua' })).toBeVisible();
  const item = await prisma.householdPantryItem.findFirstOrThrow({ where: { householdId: membership.householdId, ingredientId: matched.id } });
  await prisma.householdPantryItem.update({ where: { id: item.id }, data: { quantity: 100, revision: { increment: 1 } } });
  await page.getByRole('button', { name: 'Lưu danh sách đi chợ' }).click();
  await expect(page.getByText('Kế hoạch bữa ăn hoặc kho bếp đã thay đổi. Hãy xem lại danh sách mới.')).toBeVisible();
  expect(await prisma.householdShoppingList.count({ where: { householdId: membership.householdId } })).toBe(1);
  await page.getByRole('button', { name: 'Xem lại nguyên liệu cần mua' }).click(); await page.getByRole('button', { name: 'Lưu danh sách đi chợ' }).click();
  await expect(page.getByText('Danh sách đã lưu · Phiên bản 2')).toBeVisible();

  await prisma.householdPantryItem.updateMany({ where: { householdId: membership.householdId, ingredientId: { in: [matched.id, mismatched.id] } }, data: { quantity: 500, unit: 'g', revision: { increment: 1 } } });
  await page.getByRole('button', { name: 'Xem lại theo kế hoạch và kho hiện tại' }).click();
  await expect(page.getByText('Kho bếp đã đủ nguyên liệu cho kế hoạch tuần này.')).toBeVisible(); await expectAccessible(page);
  expect(recipe.versions).toHaveLength(1); expect(monday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

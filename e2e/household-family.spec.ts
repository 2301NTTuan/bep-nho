import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const runId = randomUUID().replace(/-/g, '');
const emailPrefix = `phase12-e2e-${runId}`;
const password = 'Phase12-browser-password!';
const prisma = new PrismaClient();

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(result.violations, null, 2)).toEqual([]);
}

async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: /Tạo tài khoản/ }).click();
  await expect(page).toHaveURL('/');
}

test.afterAll(async () => {
  const credentials = await prisma.userCredential.findMany({
    where: { normalizedEmail: { startsWith: emailPrefix } }, select: { userId: true },
  });
  const userIds = credentials.map((item) => item.userId);
  const memberships = await prisma.householdMember.findMany({ where: { userId: { in: userIds } }, select: { householdId: true } });
  const householdIds = [...new Set(memberships.map((item) => item.householdId))];
  await prisma.cookSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test('household invite → Family Taste → family cook remains historical @e2e @a11y', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const retrySuffix = testInfo.retry === 0 ? '' : `-retry-${testInfo.retry}`;
  const ownerEmail = `${emailPrefix}-owner${retrySuffix}@example.com`;
  const memberEmail = `${emailPrefix}-member${retrySuffix}@example.com`;
  await register(page, ownerEmail);
  await page.goto('/household');
  await expect(page.getByRole('heading', { name: 'Khẩu vị chung của nhà mình' })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel('Tên gia đình').fill('Nhà Phase 12');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await expect(page.getByRole('heading', { name: 'Nhà Phase 12' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo liên kết mời một lần' })).toBeEnabled();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Tạo liên kết mời một lần' }).click();
  const joinUrl = await page.getByLabel('Liên kết mời').inputValue();
  expect(joinUrl).toContain('/household/join?token=');

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await register(memberPage, memberEmail);
  await memberPage.goto(joinUrl);
  await expect(memberPage.getByRole('heading', { name: 'Vào chung một gian bếp' })).toBeVisible();
  await expectAccessible(memberPage);
  await memberPage.getByRole('button', { name: 'Chấp nhận lời mời' }).click();
  await expect(memberPage).toHaveURL('/household');
  await expect(memberPage.locator('.sessionList li')).toHaveCount(2);
  await expect(memberPage.getByRole('button', { name: 'Rời gia đình' })).toBeEnabled();
  await expect(memberPage.getByRole('button', { name: 'Tạo liên kết mời một lần' })).toHaveCount(0);
  await expectAccessible(memberPage);

  const users = await prisma.userCredential.findMany({
    where: { normalizedEmail: { in: [ownerEmail, memberEmail] } },
    include: { user: { include: { tasteProfiles: true } } },
  });
  for (const credential of users) {
    const profile = credential.user.tasteProfiles.find((item) => item.algorithmVersion === 'taste-v1')
      ?? await prisma.tasteProfile.create({ data: { userId: credential.userId, algorithmVersion: 'taste-v1' } });
    await prisma.tasteDimension.upsert({
      where: { tasteProfileId_dimensionKey_scopeType_scopeId: { tasteProfileId: profile.id, dimensionKey: 'saltiness', scopeType: 'global', scopeId: '' } },
      update: { score: credential.normalizedEmail === ownerEmail ? 0.8 : -0.2, confidence: 0.5 },
      create: { tasteProfileId: profile.id, dimensionKey: 'saltiness', score: credential.normalizedEmail === ownerEmail ? 0.8 : -0.2, confidence: 0.5 },
    });
  }
  await memberPage.reload();
  await expect(memberPage.getByText(/Tin cậy 50%/).first()).toBeVisible();

  const recipe = await prisma.recipe.findFirstOrThrow({
    where: { status: 'published', versions: { some: { publishedAt: { not: null }, adjustmentRules: { some: {} } } } },
  });
  await memberPage.goto(`/recipes/${recipe.slug}`);
  await memberPage.getByRole('button', { name: 'Gợi ý cho gia đình' }).click();
  await expect(memberPage.getByText(/Gợi ý Family Taste/).first()).toBeVisible();
  await memberPage.getByRole('button', { name: 'Nấu bản Family Taste →' }).click();
  await expect(memberPage).toHaveURL(/\/cook\//);
  const cookUrl = memberPage.url();

  await memberPage.goto('/household');
  await memberPage.getByRole('button', { name: 'Rời gia đình' }).click();
  await expect(memberPage.getByRole('heading', { name: 'Khẩu vị chung của nhà mình' })).toBeVisible();
  await memberPage.goto(cookUrl);
  await expect(memberPage.getByText(/Đang nấu/)).toBeVisible();
  await memberPage.goto(`/recipes/${recipe.slug}`);
  await expect(memberPage.getByRole('button', { name: 'Gợi ý cho gia đình' })).toHaveCount(0);
  await memberContext.close();
});

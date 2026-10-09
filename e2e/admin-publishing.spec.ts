import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const API_BASE = 'http://localhost:3001/v1';
const ADMIN_BASE = 'http://localhost:3002';
const runId = randomUUID().replace(/-/g, '');
const email = `phase11-e2e-${runId}@example.com`;
const password = 'Phase11-browser-password!';
const slug = `phase11-browser-${runId}`;
const ingredientSlugs = [`phase11-browser-tofu-${runId}`, `phase11-browser-sauce-${runId}`];
const prisma = new PrismaClient();
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWNYYacORwzEcQC9cxDRxDGSZwAAAABJRU5ErkJggg==', 'base64');

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.afterAll(async () => {
  const credentials = await prisma.userCredential.findMany({
    where: { normalizedEmail: { startsWith: `phase11-e2e-${runId}` } }, select: { userId: true },
  });
  const recipes = await prisma.recipe.findMany({
    where: { slug: { startsWith: `phase11-browser-${runId}` } },
    include: { versions: { select: { heroMediaAsset: { select: { id: true, objectKey: true } } } } },
  });
  const assets = recipes.flatMap((recipe) => recipe.versions.map((version) => version.heroMediaAsset).filter((asset) => asset !== null));
  await prisma.user.deleteMany({ where: { id: { in: credentials.map((item) => item.userId) } } });
  await prisma.recipe.deleteMany({ where: { id: { in: recipes.map((recipe) => recipe.id) } } });
  await prisma.mediaAsset.deleteMany({ where: { id: { in: assets.map((asset) => asset.id) } } });
  await prisma.ingredient.deleteMany({ where: { slug: { in: ingredientSlugs } } });
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
  });
  for (const asset of assets) {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: asset.objectKey })).catch(() => undefined);
  }
  s3.destroy();
  await prisma.$disconnect();
});

test('admin publishes immutable media recipes and archives safely @e2e @a11y', async ({ page }) => {
  test.setTimeout(240_000);
  const registration = await page.request.post(`${API_BASE}/auth/register`, {
    headers: { origin: 'http://localhost:3002' }, data: { email, password },
  });
  expect(registration.status()).toBe(201);
  const credential = await prisma.userCredential.findUniqueOrThrow({ where: { normalizedEmail: email } });
  await prisma.userCredential.update({ where: { id: credential.id }, data: { emailVerifiedAt: new Date() } });
  await prisma.user.update({ where: { id: credential.userId }, data: { role: 'admin' } });
  await prisma.tasteProfile.create({
    data: {
      userId: credential.userId,
      algorithmVersion: 'taste-v1',
      dimensions: { create: { dimensionKey: 'saltiness', score: 0.2, confidence: 0.8 } },
    },
  });

  await page.goto(`${ADMIN_BASE}/login`);
  await expectAccessible(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(`${ADMIN_BASE}/recipes`);
  await expect(page.getByRole('heading', { name: 'Công thức chuẩn' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Tạo công thức' }).click();
  await page.getByLabel('Slug').fill(slug);
  await page.getByLabel('Tên món').fill('Đậu phụ sốt trình duyệt');
  await page.getByRole('button', { name: 'Tạo draft' }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+\/edit\?draft=/);
  const recipeId = page.url().match(/\/recipes\/([^/]+)\/edit/)![1];

  await page.getByLabel('Tóm tắt').fill('Công thức được xuất bản qua luồng editorial trong trình duyệt.');
  await page.getByRole('button', { name: '+ Thêm nguyên liệu' }).click();
  await page.getByRole('button', { name: '+ Thêm nguyên liệu' }).click();
  await page.getByLabel('Slug').nth(1).fill(ingredientSlugs[0]);
  await page.getByLabel('Tên chuẩn').nth(0).fill('Đậu phụ trình duyệt');
  await page.getByLabel('Lượng').nth(0).fill('300');
  await page.getByLabel('Slug').nth(2).fill(ingredientSlugs[1]);
  await page.getByLabel('Tên chuẩn').nth(1).fill('Sốt trình duyệt');
  await page.getByLabel('Lượng').nth(1).fill('30');
  await page.getByLabel('Đơn vị').nth(1).fill('ml');
  await page.getByRole('button', { name: '+ Thêm bước' }).click();
  await page.getByRole('button', { name: '+ Thêm bước' }).click();
  await page.getByLabel('Hướng dẫn').nth(0).fill('Áp chảo đậu phụ đến vàng.');
  await page.getByLabel('Hướng dẫn').nth(1).fill('Thêm sốt và đảo nhẹ.');
  await page.getByRole('button', { name: '+ Thêm quy tắc' }).click();
  await page.getByLabel('Chiều vị').selectOption('saltiness');
  await page.getByLabel('Chọn ảnh').setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByText(/Ảnh đã được chuẩn hóa/)).toBeVisible();
  await page.getByLabel('Alt text có ý nghĩa').fill('Đậu phụ vàng phủ sốt nâu trong đĩa gốm');
  await page.getByRole('button', { name: 'Lưu draft' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Đã lưu revision/)).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel(/Tôi đã kiểm tra/).check();
  await page.getByRole('button', { name: 'Publish version mới' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${ADMIN_BASE}/recipes/${recipeId}`);
  await expect(page.getByText('V1')).toBeVisible();

  const v1 = await prisma.recipeVersion.findFirstOrThrow({
    where: { recipeId, versionNo: 1 }, include: { ingredients: true, steps: true, adjustmentRules: true },
  });
  const v1Snapshot = JSON.stringify(v1);
  const mediaId = v1.heroMediaAssetId!;

  await page.goto('http://localhost:3000');
  const card = page.getByRole('link', { name: new RegExp('Đậu phụ sốt trình duyệt') });
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toHaveAttribute('alt', 'Đậu phụ vàng phủ sốt nâu trong đĩa gốm');
  await card.click();
  await expect(page.locator('.detailHeroImage')).toHaveAttribute('src', new RegExp(`/v1/media/${mediaId}`));

  const cook = await page.request.post(`${API_BASE}/cook-sessions`, {
    headers: { origin: 'http://localhost:3000' }, data: { recipeSlug: slug, servings: 2 },
  });
  expect(cook.status()).toBe(201);
  const cookSessionId = (await cook.json() as { data: { id: string } }).data.id;

  const newDraft = await page.request.post(`${API_BASE}/admin/recipes/${recipeId}/drafts`, {
    headers: { origin: 'http://localhost:3002' },
  });
  expect(newDraft.status()).toBe(201);
  const draftId = (await newDraft.json() as { data: { id: string } }).data.id;
  await page.goto(`${ADMIN_BASE}/recipes/${recipeId}/edit?draft=${draftId}`);
  await page.getByLabel('Tóm tắt').fill('Nội dung V2 đã được chỉnh có chủ đích.');
  await page.getByRole('button', { name: 'Lưu draft' }).click();
  await expect(page.getByText(/Đã lưu revision/)).toBeVisible();
  await page.getByLabel(/Tôi đã kiểm tra/).check();
  await page.getByRole('button', { name: 'Publish version mới' }).click();
  await expect(page).toHaveURL(`${ADMIN_BASE}/recipes/${recipeId}`);
  await expect(page.getByText('V2')).toBeVisible();
  expect(JSON.stringify(await prisma.recipeVersion.findUniqueOrThrow({
    where: { id: v1.id }, include: { ingredients: true, steps: true, adjustmentRules: true },
  }))).toBe(v1Snapshot);

  await page.goto(`${ADMIN_BASE}/recipes`);
  const recipeRow = page.getByRole('article').filter({ hasText: 'Đậu phụ sốt trình duyệt' });
  await recipeRow.getByRole('button', { name: 'Archive' }).focus();
  await page.keyboard.press('Enter');
  await expect(recipeRow.getByText('archived')).toBeVisible();
  expect((await page.request.get(`${API_BASE}/recipes/${slug}`)).status()).toBe(404);
  expect((await page.request.get(`${API_BASE}/cook-sessions/${cookSessionId}`)).status()).toBe(200);

  await recipeRow.getByRole('button', { name: 'Restore' }).focus();
  await page.keyboard.press('Enter');
  await expect(recipeRow.getByText('published')).toBeVisible();
  expect((await page.request.get(`${API_BASE}/recipes/${slug}`)).status()).toBe(200);
  expect(await prisma.recipeVersion.count({ where: { recipeId } })).toBe(2);
});

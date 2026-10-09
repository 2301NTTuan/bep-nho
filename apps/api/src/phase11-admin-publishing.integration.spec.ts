import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttp } from './http/configure-http';
import { PrismaService } from './database/prisma.service';
import sharp from 'sharp';
import { MediaService } from './admin/media.service';
import {
  RecipePublishLockService,
  type RecipePublishLockPhase,
  type RecipePublishOperation,
} from './admin/recipe-publish-lock.service';

const ORIGIN = 'http://localhost:3002';
const PASSWORD = 'Phase11-admin-password!';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Phase 11 admin publishing workflow (HTTP integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const emailPrefix = `phase11-${runId}`;
  const slug = `phase11-recipe-${runId}`;
  const ingredientSlugs = [`phase11-tofu-${runId}`, `phase11-sauce-${runId}`];
  let app: INestApplication;
  let prisma: PrismaService;
  let media: MediaService;
  let publishLock: RecipePublishLockService;
  let base: string;
  let adminCookie: string;
  let userCookie: string;
  let adminUserId: string;
  let recipeId: string;
  const mediaIds: string[] = [];
  let testImages: { png: Buffer; jpeg: Buffer; webp: Buffer };

  async function request(path: string, init: RequestInit & { cookie?: string } = {}) {
    const { cookie, ...fetchInit } = init;
    const headers = new Headers(fetchInit.headers);
    headers.set('origin', ORIGIN);
    if (cookie) headers.set('cookie', cookie);
    if (fetchInit.body && !(fetchInit.body instanceof FormData)) headers.set('content-type', 'application/json');
    return fetch(`${base}${path}`, { ...fetchInit, headers });
  }

  async function json<T>(response: Response): Promise<T> { return await response.json() as T; }
  function cookieFrom(response: Response) {
    const cookie = response.headers.get('set-cookie');
    if (!cookie) throw new Error('Expected session cookie');
    return cookie.split(';', 1)[0];
  }

  async function register(label: string) {
    const email = `${emailPrefix}-${label}@example.com`;
    const response = await request('/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(response.status).toBe(201);
    const body = await json<{ data: { user: { id: string } } }>(response);
    return { email, userId: body.data.user.id, cookie: cookieFrom(response) };
  }

  async function upload(cookie: string, bytes = testImages.png, name = 'client-name-must-not-be-key.png', type = 'image/png') {
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(bytes)], { type }), name);
    return request('/admin/media', { method: 'POST', cookie, body: form });
  }

  function validContent(mediaId: string | null, summary = 'A controlled Phase 11 recipe.') {
    return {
      slug,
      title: 'Đậu phụ sốt Phase 11',
      cuisine: 'vietnamese',
      servings: 2,
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      summary,
      ingredients: [
        {
          slug: ingredientSlugs[0], canonicalName: 'Đậu phụ Phase 11', category: 'protein',
          createIfMissing: true, quantity: 300, unit: 'g', preparation: 'cắt miếng', note: null,
          sortOrder: 1, scalingMode: 'LINEAR', scalingExponent: 1, roundingIncrement: 10,
        },
        {
          slug: ingredientSlugs[1], canonicalName: 'Sốt Phase 11', category: 'seasoning',
          createIfMissing: true, quantity: 30, unit: 'ml', preparation: null, note: null,
          sortOrder: 2, scalingMode: 'CONSERVATIVE', scalingExponent: 0.8, roundingIncrement: 5,
        },
      ],
      steps: [
        { stepNo: 1, instruction: 'Áp chảo đậu phụ.', durationSeconds: 300, heatLevel: 'vừa', tip: null },
        { stepNo: 2, instruction: 'Thêm sốt và đảo đều.', durationSeconds: 180, heatLevel: 'nhỏ', tip: 'Không đảo quá mạnh.' },
      ],
      adjustmentRules: [
        { ingredientSlug: ingredientSlugs[1], dimensionKey: 'saltiness', sensitivity: 0.15, minFactor: 0.8, maxFactor: 1.2 },
      ],
      heroMediaAssetId: mediaId,
      heroMediaAlt: mediaId ? 'Đậu phụ vàng trong sốt nâu trên đĩa trắng' : null,
    };
  }

  beforeAll(async () => {
    const source = sharp({ create: { width: 2, height: 2, channels: 3, background: '#a83e27' } });
    testImages = {
      png: await source.clone().png().toBuffer(),
      jpeg: await source.clone().jpeg().toBuffer(),
      webp: await source.clone().webp().toBuffer(),
    };
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    media = app.get(MediaService);
    publishLock = app.get(RecipePublishLockService);
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;

    const admin = await register('admin');
    const user = await register('user');
    adminCookie = admin.cookie;
    userCookie = user.cookie;
    adminUserId = admin.userId;
    await prisma.userCredential.update({
      where: { userId: admin.userId }, data: { emailVerifiedAt: new Date() },
    });
    await prisma.user.update({ where: { id: admin.userId }, data: { role: 'admin' } });
    await prisma.tasteProfile.create({
      data: {
        userId: admin.userId,
        algorithmVersion: 'taste-v1',
        dimensions: { create: { dimensionKey: 'saltiness', score: 0.2, confidence: 0.8 } },
      },
    });
  });

  afterEach(() => publishLock.setTestHook(null));

  afterAll(async () => {
    publishLock.setTestHook(null);
    const users = await prisma.userCredential.findMany({
      where: { normalizedEmail: { startsWith: emailPrefix } }, select: { userId: true },
    });
    await prisma.user.deleteMany({ where: { id: { in: users.map((item) => item.userId) } } });
    await prisma.recipe.deleteMany({ where: { slug: { startsWith: `phase11-recipe-${runId}` } } });
    for (const mediaId of mediaIds) await media.remove(mediaId).catch(() => undefined);
    await prisma.ingredient.deleteMany({ where: { slug: { in: ingredientSlugs } } });
    await app.close();
  });

  it('enforces authoritative admin authorization and role changes on existing sessions', async () => {
    expect((await request('/admin/recipes')).status).toBe(401);
    expect((await request('/admin/recipes', { cookie: userCookie })).status).toBe(403);
    expect((await request('/admin/recipes', { cookie: adminCookie })).status).toBe(200);
    expect((await request('/admin/recipes', {
      method: 'POST', cookie: userCookie,
      body: JSON.stringify({ slug: `${slug}-forbidden`, title: 'Forbidden', role: 'admin' }),
    })).status).toBe(403);

    const normal = await prisma.userCredential.findUniqueOrThrow({
      where: { normalizedEmail: `${emailPrefix}-user@example.com` },
    });
    await prisma.user.update({ where: { id: normal.userId }, data: { role: 'admin' } });
    expect((await request('/admin/recipes', { cookie: userCookie })).status).toBe(200);
    await prisma.user.update({ where: { id: normal.userId }, data: { role: 'user' } });
    expect((await request('/admin/recipes', { cookie: userCookie })).status).toBe(403);
  });

  it('rejects an unchanged clone whose published source uses a legacy hash format', async () => {
    const ingredient = await prisma.ingredient.create({
      data: {
        slug: ingredientSlugs[0], canonicalName: 'Đậu phụ Phase 11', category: 'protein',
      },
    });
    const seeded = await prisma.recipe.create({
      data: {
        slug: `${slug}-legacy`,
        canonicalTitle: 'Công thức legacy hash',
        cuisine: 'vietnamese',
        status: 'published',
      },
    });
    const source = await prisma.recipeVersion.create({
      data: {
        recipeId: seeded.id,
        versionNo: 1,
        servings: 2,
        prepTimeMinutes: 5,
        cookTimeMinutes: 10,
        summary: 'Published before the Phase 11 canonical hash shape.',
        contentHash: '0'.repeat(64),
        publishedAt: new Date(),
        ingredients: {
          create: {
            ingredientId: ingredient.id,
            quantity: 200,
            unit: 'g',
            sortOrder: 1,
            scalingMode: 'LINEAR',
            scalingExponent: 1,
          },
        },
        steps: {
          create: { stepNo: 1, instruction: 'Nấu fixture legacy.' },
        },
      },
      select: { id: true, contentHash: true },
    });
    const versionCount = await prisma.recipeVersion.count({ where: { recipeId: seeded.id } });
    const cloneResponse = await request(`/admin/recipes/${seeded.id}/drafts`, {
      method: 'POST', cookie: adminCookie,
    });
    expect(cloneResponse.status).toBe(201);
    const clone = (await json<{ data: { id: string; revision: number } }>(cloneResponse)).data;
    try {
      expect((await request(`/admin/recipe-drafts/${clone.id}/publish`, {
        method: 'POST', cookie: adminCookie,
        body: JSON.stringify({ expectedRevision: clone.revision }),
      })).status).toBe(409);
      expect(await prisma.recipeVersion.count({ where: { recipeId: seeded.id } })).toBe(versionCount);
      expect((await prisma.recipeVersion.findUniqueOrThrow({ where: { id: source.id } })).contentHash)
        .toBe(source.contentHash);
    } finally {
      await prisma.recipeDraft.delete({ where: { id: clone.id } });
    }
  });

  it('validates and stores immutable media without trusting filename or MIME claims', async () => {
    expect((await upload(userCookie)).status).toBe(403);
    expect((await upload(adminCookie, Buffer.from('not an image'), 'fake.png', 'image/png')).status).toBe(422);
    expect((await upload(adminCookie, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image.svg', 'image/svg+xml')).status).toBe(422);
    expect((await upload(adminCookie, Buffer.alloc(8 * 1024 * 1024 + 1), 'huge.png')).status).toBe(413);

    const first = await upload(adminCookie);
    expect(first.status).toBe(201);
    const firstAsset = (await json<{ data: { id: string; mimeType: string; url: string } }>(first)).data;
    mediaIds.push(firstAsset.id);
    expect(firstAsset.mimeType).toBe('image/webp');
    const stored = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: firstAsset.id } });
    expect(stored.objectKey).toMatch(/^recipe-media\/[0-9a-f-]+\.webp$/);
    expect(stored.objectKey).not.toContain('client-name');

    for (const [format, bytes] of Object.entries(testImages)) {
      const extra = await upload(adminCookie, bytes, `ignored.${format}`, `image/${format}`);
      expect(extra.status).toBe(201);
      const extraAsset = (await json<{ data: { id: string } }>(extra)).data;
      mediaIds.push(extraAsset.id);
      expect(extraAsset.id).not.toBe(firstAsset.id);
      expect((await request(`/admin/media/${extraAsset.id}`, { method: 'DELETE', cookie: adminCookie })).status).toBe(200);
      expect((await request(`/media/${extraAsset.id}`)).status).toBe(404);
    }
  });

  it('detects draft revision conflicts and publishes under a deterministic recipe lock', async () => {
    const created = await request('/admin/recipes', {
      method: 'POST', cookie: adminCookie,
      body: JSON.stringify({ slug, title: 'Phase 11 draft', cuisine: 'vietnamese' }),
    });
    expect(created.status).toBe(201);
    const initial = (await json<{ data: { id: string; recipeId: string; revision: number; content: object } }>(created)).data;
    recipeId = initial.recipeId;

    expect((await request(`/admin/recipes/${recipeId}/drafts`, { method: 'POST', cookie: userCookie })).status).toBe(403);
    expect((await request(`/admin/recipe-drafts/${initial.id}`, { cookie: userCookie })).status).toBe(403);
    expect((await request(`/admin/recipe-drafts/${initial.id}`, {
      method: 'PATCH', cookie: userCookie,
      body: JSON.stringify({ expectedRevision: initial.revision, content: initial.content }),
    })).status).toBe(403);
    expect((await request(`/admin/recipe-drafts/${initial.id}/publish`, {
      method: 'POST', cookie: userCookie, body: JSON.stringify({ expectedRevision: initial.revision }),
    })).status).toBe(403);
    expect((await request(`/admin/recipes/${recipeId}/archive`, { method: 'POST', cookie: userCookie })).status).toBe(403);
    expect((await request(`/admin/recipes/${recipeId}/restore`, { method: 'POST', cookie: userCookie })).status).toBe(403);

    const competing = await Promise.all([
      request(`/admin/recipe-drafts/${initial.id}`, {
        method: 'PATCH', cookie: adminCookie,
        body: JSON.stringify({ expectedRevision: 1, content: { ...initial.content, title: 'Admin A' } }),
      }),
      request(`/admin/recipe-drafts/${initial.id}`, {
        method: 'PATCH', cookie: adminCookie,
        body: JSON.stringify({ expectedRevision: 1, content: { ...initial.content, title: 'Admin B' } }),
      }),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([200, 409]);

    const latestDraft = (await json<{ data: { revision: number } }>(await request(`/admin/recipe-drafts/${initial.id}`, { cookie: adminCookie }))).data;
    const hero = mediaIds[0];
    const saved = await request(`/admin/recipe-drafts/${initial.id}`, {
      method: 'PATCH', cookie: adminCookie,
      body: JSON.stringify({ expectedRevision: latestDraft.revision, content: validContent(hero) }),
    });
    expect(saved.status).toBe(200);
    const revision = (await json<{ data: { revision: number } }>(saved)).data.revision;

    const firstAcquired = deferred();
    const releaseFirst = deferred();
    const secondAttempted = deferred();
    let holding = false;
    publishLock.setTestHook(async (
      phase: RecipePublishLockPhase,
      operation: RecipePublishOperation,
      lockedRecipeId: string,
    ) => {
      if (operation !== 'publish' || lockedRecipeId !== recipeId) return;
      if (phase === 'before_acquire' && holding) secondAttempted.resolve();
      if (phase === 'acquired' && !holding) {
        holding = true;
        firstAcquired.resolve();
        await releaseFirst.promise;
      }
    });
    const firstPublish = request(`/admin/recipe-drafts/${initial.id}/publish`, {
      method: 'POST', cookie: adminCookie, body: JSON.stringify({ expectedRevision: revision }),
    });
    await firstAcquired.promise;
    const secondPublish = request(`/admin/recipe-drafts/${initial.id}/publish`, {
      method: 'POST', cookie: adminCookie, body: JSON.stringify({ expectedRevision: revision }),
    });
    await secondAttempted.promise;
    releaseFirst.resolve();
    const published = await Promise.all([firstPublish, secondPublish]);
    publishLock.setTestHook(null);
    expect(published.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.recipeVersion.count({ where: { recipeId } })).toBe(1);

    const publicDetail = await request(`/recipes/${slug}`);
    expect(publicDetail.status).toBe(200);
    const publicBody = await json<{ data: { version: { heroMedia: { id: string } } } }>(publicDetail);
    expect(publicBody.data.version.heroMedia.id).toBe(hero);
    const image = await request(`/media/${hero}`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toContain('image/webp');
    expect(image.headers.get('cache-control')).toContain('immutable');
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect((await request(`/admin/media/${hero}`, { method: 'DELETE', cookie: adminCookie })).status).toBe(409);
  });

  it('rejects identical/stale drafts, preserves old versions, and allocates monotonic versions', async () => {
    const v1 = await prisma.recipeVersion.findFirstOrThrow({
      where: { recipeId, versionNo: 1 },
      include: { ingredients: true, steps: true, adjustmentRules: true },
    });
    const v1Snapshot = JSON.stringify(v1);
    const identical = (await json<{ data: { id: string; revision: number } }>(await request(`/admin/recipes/${recipeId}/drafts`, { method: 'POST', cookie: adminCookie }))).data;
    expect((await request(`/admin/recipe-drafts/${identical.id}/publish`, {
      method: 'POST', cookie: adminCookie, body: JSON.stringify({ expectedRevision: identical.revision }),
    })).status).toBe(409);

    const changedDraft = (await json<{ data: { id: string; revision: number; content: ReturnType<typeof validContent> } }>(await request(`/admin/recipes/${recipeId}/drafts`, { method: 'POST', cookie: adminCookie }))).data;
    const changed = await request(`/admin/recipe-drafts/${changedDraft.id}`, {
      method: 'PATCH', cookie: adminCookie,
      body: JSON.stringify({ expectedRevision: changedDraft.revision, content: { ...changedDraft.content, summary: 'Published V2 content.' } }),
    });
    const changedRevision = (await json<{ data: { revision: number } }>(changed)).data.revision;
    const v2Publish = await request(`/admin/recipe-drafts/${changedDraft.id}/publish`, {
      method: 'POST', cookie: adminCookie, body: JSON.stringify({ expectedRevision: changedRevision }),
    });
    expect(v2Publish.status).toBe(201);
    expect((await json<{ data: { versionNo: number } }>(v2Publish)).data.versionNo).toBe(2);

    const draftA = (await json<{ data: { id: string; revision: number; content: ReturnType<typeof validContent> } }>(await request(`/admin/recipes/${recipeId}/drafts`, { method: 'POST', cookie: adminCookie }))).data;
    const draftB = (await json<{ data: { id: string; revision: number; content: ReturnType<typeof validContent> } }>(await request(`/admin/recipes/${recipeId}/drafts`, { method: 'POST', cookie: adminCookie }))).data;
    const patchedA = await request(`/admin/recipe-drafts/${draftA.id}`, { method: 'PATCH', cookie: adminCookie, body: JSON.stringify({ expectedRevision: draftA.revision, content: { ...draftA.content, summary: 'Concurrent V3 winner.' } }) });
    const patchedB = await request(`/admin/recipe-drafts/${draftB.id}`, { method: 'PATCH', cookie: adminCookie, body: JSON.stringify({ expectedRevision: draftB.revision, content: { ...draftB.content, summary: 'Concurrent stale loser.' } }) });
    const revA = (await json<{ data: { revision: number } }>(patchedA)).data.revision;
    const revB = (await json<{ data: { revision: number } }>(patchedB)).data.revision;

    const acquired = deferred(); const release = deferred(); const waiter = deferred(); let held = false;
    publishLock.setTestHook(async (phase, operation, lockedRecipeId) => {
      if (operation !== 'publish' || lockedRecipeId !== recipeId) return;
      if (phase === 'before_acquire' && held) waiter.resolve();
      if (phase === 'acquired' && !held) { held = true; acquired.resolve(); await release.promise; }
    });
    const publishA = request(`/admin/recipe-drafts/${draftA.id}/publish`, { method: 'POST', cookie: adminCookie, body: JSON.stringify({ expectedRevision: revA }) });
    await acquired.promise;
    const publishB = request(`/admin/recipe-drafts/${draftB.id}/publish`, { method: 'POST', cookie: adminCookie, body: JSON.stringify({ expectedRevision: revB }) });
    await waiter.promise; release.resolve();
    const results = await Promise.all([publishA, publishB]);
    publishLock.setTestHook(null);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    expect((await prisma.recipeVersion.findMany({ where: { recipeId }, orderBy: { versionNo: 'asc' }, select: { versionNo: true } })).map((item) => item.versionNo)).toEqual([1, 2, 3]);
    const unchangedV1 = await prisma.recipeVersion.findUniqueOrThrow({
      where: { id: v1.id }, include: { ingredients: true, steps: true, adjustmentRules: true },
    });
    expect(JSON.stringify(unchangedV1)).toBe(v1Snapshot);
  });

  it('archives every new-use entry point while preserving history and restores without a version', async () => {
    const personalized = await request(`/me/recipes/${slug}/personalized-versions`, { method: 'POST', cookie: adminCookie });
    expect(personalized.status).toBe(201);
    const personalizedId = (await json<{ data: { id: string } }>(personalized)).data.id;
    const active = await request('/cook-sessions', {
      method: 'POST', cookie: adminCookie,
      body: JSON.stringify({ recipeSlug: slug, personalizedRecipeVersionId: personalizedId, servings: 2 }),
    });
    expect(active.status).toBe(201);
    const activeBody = (await json<{ data: { id: string; snapshot: unknown } }>(active)).data;
    const snapshotBefore = JSON.stringify(activeBody.snapshot);
    await prisma.cookSession.update({ where: { id: activeBody.id }, data: { status: 'completed', completedAt: new Date() } });
    const feedbackResponse = await request(`/cook-sessions/${activeBody.id}/feedback`, {
      method: 'POST', cookie: adminCookie,
      body: JSON.stringify({ dimensions: { saltiness: 0.4 }, privateNote: 'Phase 11 retained provenance' }),
    });
    expect(feedbackResponse.status).toBe(201);
    const feedbackId = (await json<{ data: { feedback: { id: string } } }>(feedbackResponse)).data.feedback.id;
    const versionCount = await prisma.recipeVersion.count({ where: { recipeId } });

    expect((await request(`/admin/recipes/${recipeId}/archive`, { method: 'POST', cookie: adminCookie })).status).toBe(201);
    expect((await request(`/recipes/${slug}`)).status).toBe(404);
    const list = await json<{ data: Array<{ id: string }> }>(await request('/recipes?limit=100'));
    expect(list.data.some((item) => item.id === recipeId)).toBe(false);
    expect((await request('/cook-sessions', { method: 'POST', cookie: adminCookie, body: JSON.stringify({ recipeSlug: slug, servings: 2 }) })).status).toBe(404);
    expect((await request(`/me/recipes/${slug}/personalized-versions`, { method: 'POST', cookie: adminCookie })).status).toBe(404);
    expect((await request('/cook-sessions', { method: 'POST', cookie: adminCookie, body: JSON.stringify({ recipeSlug: slug, personalizedRecipeVersionId: personalizedId, servings: 2 }) })).status).toBe(409);
    const historical = await json<{ data: { snapshot: unknown } }>(await request(`/cook-sessions/${activeBody.id}`, { cookie: adminCookie }));
    expect(JSON.stringify(historical.data.snapshot)).toBe(snapshotBefore);
    const tasteHistory = await json<{ data: Array<{ kind: string; signal?: { cookFeedbackId: string | null } }> }>(
      await request('/me/taste-profile/history?limit=100', { cookie: adminCookie }),
    );
    expect(tasteHistory.data.some((event) => event.kind === 'signal' && event.signal?.cookFeedbackId === feedbackId)).toBe(true);
    expect(await prisma.recipeVersion.findFirst({ where: { recipeId, versionNo: 1 } })).not.toBeNull();

    expect((await request(`/admin/recipes/${recipeId}/restore`, { method: 'POST', cookie: adminCookie })).status).toBe(201);
    expect((await request(`/recipes/${slug}`)).status).toBe(200);
    expect(await prisma.recipeVersion.count({ where: { recipeId } })).toBe(versionCount);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } })).role).toBe('admin');
  });
});

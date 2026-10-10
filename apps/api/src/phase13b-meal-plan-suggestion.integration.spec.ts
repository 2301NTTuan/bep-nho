import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AdminRecipesService } from './admin/admin-recipes.service';
import { RecipePublishLockService } from './admin/recipe-publish-lock.service';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';
import { configureHttp } from './http/configure-http';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Phase13b-suggestion-password!';
const WEEK = '2026-11-02';

type Account = { id: string; cookie: string };
type Preview = {
  data: {
    algorithmVersion: string;
    weekStart: string;
    suggestionHash: string;
    familyTaste: unknown;
    slots: Array<{
      plannedDate: string;
      mealType: string;
      recipe: { id: string; slug: string; title: string };
      householdPersonalizedRecipeVersion: { id: string; versionNo: number; algorithmVersion: string };
      reason: { recentUseCount: number; alreadyUsedThisWeek: boolean; deterministicTieBreak: string };
    }>;
  };
};

describe('Phase 13B deterministic household meal-plan suggestions', () => {
  const runId = randomUUID().replace(/-/g, '');
  const prefix = `phase13b-${runId}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let adminRecipes: AdminRecipesService;
  let recipeLock: RecipePublishLockService;
  let base: string;
  let owner: Account;
  let member: Account;
  let outsider: Account;
  let householdId: string;
  let ingredientId: string;
  let profileId: string;
  let personalVersionId: string;
  const recipeIds: string[] = [];
  const userIds: string[] = [];
  const householdIds: string[] = [];
  const baselineStatuses: Array<{ id: string; status: string }> = [];
  const recipe = new Map<string, { id: string; slug: string; latestVersionId: string }>();

  async function request(path: string, init: RequestInit & { cookie?: string } = {}) {
    const { cookie, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set('origin', ORIGIN);
    if (cookie) headers.set('cookie', cookie);
    if (rest.body) headers.set('content-type', 'application/json');
    return fetch(`${base}${path}`, { ...rest, headers });
  }

  async function json<T>(response: Response): Promise<T> {
    return await response.json() as T;
  }

  async function register(label: string): Promise<Account> {
    const response = await request('/auth/register', {
      method: 'POST', body: JSON.stringify({ email: `${prefix}-${label}@example.com`, password: PASSWORD }),
    });
    expect(response.status).toBe(201);
    const result = await json<{ data: { user: { id: string } } }>(response);
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Expected session cookie.');
    userIds.push(result.data.user.id);
    return { id: result.data.user.id, cookie };
  }

  async function createPlan(weekStart: string, account = owner) {
    const response = await request('/me/household/meal-plans', {
      method: 'POST', cookie: account.cookie, body: JSON.stringify({ weekStart }),
    });
    expect(response.status).toBe(201);
  }

  async function preview(weekStart: string, slots: Array<{ plannedDate: string; mealType: string }>, account = owner) {
    const response = await request(`/me/household/meal-plans/${weekStart}/suggestions`, {
      method: 'POST', cookie: account.cookie, body: JSON.stringify({ slots }),
    });
    expect(response.status).toBe(201);
    return json<Preview>(response);
  }

  async function apply(weekStart: string, slots: Array<{ plannedDate: string; mealType: string }>, hash: string, account = owner) {
    return request(`/me/household/meal-plans/${weekStart}/suggestions/apply`, {
      method: 'POST', cookie: account.cookie,
      body: JSON.stringify({ slots, expectedSuggestionHash: hash }),
    });
  }

  function canonicalEntryBody(overrides: Record<string, unknown> = {}) {
    return {
      plannedDate: WEEK, mealType: 'lunch', sortOrder: 0,
      recipeVersionId: recipe.get('a')!.latestVersionId,
      householdPersonalizedRecipeVersionId: null,
      servings: 4, note: null, ...overrides,
    };
  }

  async function addHistory(weekStart: string, key: string) {
    await prisma.householdMealPlan.create({
      data: {
        householdId, weekStart: new Date(`${weekStart}T00:00:00.000Z`), createdByUserId: owner.id,
        entries: {
          create: {
            plannedDate: new Date(`${weekStart}T00:00:00.000Z`), mealType: 'lunch', sortOrder: 0,
            recipeId: recipe.get(key)!.id, recipeVersionId: recipe.get(key)!.latestVersionId,
            servings: 4, createdByUserId: owner.id,
          },
        },
      },
    });
  }

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_KEY_PREFIX = `${prefix}:auth`;
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    adminRecipes = app.get(AdminRecipesService);
    recipeLock = app.get(RecipePublishLockService);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/v1`;

    baselineStatuses.push(...await prisma.recipe.findMany({ select: { id: true, status: true } }));
    await prisma.recipe.updateMany({ where: { id: { in: baselineStatuses.map((item) => item.id) } }, data: { status: 'archived' } });

    [owner, member, outsider] = await Promise.all([register('owner'), register('member'), register('outsider')]);
    const householdResponse = await request('/me/household', {
      method: 'POST', cookie: owner.cookie, body: JSON.stringify({ name: 'Nhà gợi ý deterministic' }),
    });
    householdId = (await json<{ data: { id: string } }>(householdResponse)).data.id;
    householdIds.push(householdId);

    ingredientId = (await prisma.ingredient.create({
      data: { slug: `${prefix}-salt`, canonicalName: 'Muối Phase 13B' },
    })).id;
    const a = await prisma.recipe.create({
      data: {
        slug: `${prefix}-a`, canonicalTitle: 'Món A', status: 'published',
        versions: {
          create: [
            {
              versionNo: 1, servings: 4, contentHash: `${runId}a1`, publishedAt: new Date(Date.now() - 1000),
              ingredients: { create: { ingredientId, quantity: 10, unit: 'g', sortOrder: 0 } },
              adjustmentRules: { create: { ingredientId, dimensionKey: 'saltiness', sensitivity: 1, minFactor: 0.5, maxFactor: 1.5 } },
            },
            {
              versionNo: 2, servings: 4, contentHash: `${runId}a2`, publishedAt: new Date(),
              ingredients: { create: { ingredientId, quantity: 12, unit: 'g', sortOrder: 0 } },
              adjustmentRules: { create: { ingredientId, dimensionKey: 'saltiness', sensitivity: 1, minFactor: 0.5, maxFactor: 1.5 } },
            },
          ],
        },
      },
      include: { versions: { orderBy: { versionNo: 'asc' } } },
    });
    recipe.set('a', { id: a.id, slug: a.slug, latestVersionId: a.versions[1].id });
    recipeIds.push(a.id);
    for (const key of ['b', 'c'] as const) {
      const created = await prisma.recipe.create({
        data: {
          slug: `${prefix}-${key}`, canonicalTitle: `Món ${key.toUpperCase()}`, status: 'published',
          versions: { create: { versionNo: 1, servings: 4, contentHash: `${runId}${key}1`, publishedAt: new Date() } },
        }, include: { versions: true },
      });
      recipe.set(key, { id: created.id, slug: created.slug, latestVersionId: created.versions[0].id });
      recipeIds.push(created.id);
    }
    for (const [key, status] of [['draft', 'draft'], ['archived', 'archived']] as const) {
      const created = await prisma.recipe.create({
        data: {
          slug: `${prefix}-${key}`, canonicalTitle: `Món ${key}`, status,
          versions: { create: { versionNo: 1, servings: 4, contentHash: `${runId}${key}`, publishedAt: new Date() } },
        },
      });
      recipeIds.push(created.id);
    }

    const profile = await prisma.tasteProfile.create({
      data: {
        userId: owner.id, algorithmVersion: 'taste-v1',
        dimensions: { create: { dimensionKey: 'saltiness', score: 0, confidence: 0.4 } },
      },
    });
    profileId = profile.id;
    personalVersionId = (await prisma.personalizedRecipeVersion.create({
      data: {
        userId: owner.id, recipeId: a.id, baseRecipeVersionId: a.versions[1].id,
        tasteProfileId: profile.id, versionNo: 1, algorithmVersion: 'personalize-v3',
        contentHash: `${runId}personal`, adjustmentJson: [] as Prisma.InputJsonValue,
        snapshotJson: {} as Prisma.InputJsonValue,
      },
    })).id;

    await addHistory('2026-10-26', 'a');
    await addHistory('2026-10-19', 'a');
    await addHistory('2026-09-28', 'b');
    await createPlan(WEEK);
  });

  afterAll(async () => {
    recipeLock.setTestHook(null);
    await prisma.householdMealPlanEntry.deleteMany({ where: { mealPlan: { householdId: { in: householdIds } } } });
    await prisma.householdMealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: recipeIds } } });
    await prisma.ingredient.deleteMany({ where: { id: ingredientId } });
    for (const item of baselineStatuses) {
      await prisma.recipe.updateMany({ where: { id: item.id }, data: { status: item.status } });
    }
    await app.close();
  });

  it('validates slot requests, membership, existing-plan requirement, and empty slots', async () => {
    const validSlots = [{ plannedDate: WEEK, mealType: 'lunch' }];
    expect((await request(`/me/household/meal-plans/${WEEK}/suggestions`, {
      method: 'POST', cookie: outsider.cookie, body: JSON.stringify({ slots: validSlots }),
    })).status).toBe(404);
    expect((await apply(WEEK, validSlots, '0'.repeat(64), outsider)).status).toBe(404);
    expect((await request('/me/household/meal-plans/2026-12-07/suggestions', {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify({ slots: [{ plannedDate: '2026-12-07', mealType: 'lunch' }] }),
    })).status).toBe(404);
    for (const mealType of ['breakfast', 'other']) {
      expect((await request(`/me/household/meal-plans/${WEEK}/suggestions`, {
        method: 'POST', cookie: owner.cookie,
        body: JSON.stringify({ slots: [{ plannedDate: WEEK, mealType }] }),
      })).status).toBe(400);
    }
    expect((await request(`/me/household/meal-plans/${WEEK}/suggestions`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify({ slots: [validSlots[0], validSlots[0]] }),
    })).status).toBe(400);

    const manual = await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie, body: JSON.stringify(canonicalEntryBody()),
    });
    const manualId = (await json<{ data: { id: string } }>(manual)).data.id;
    expect((await request(`/me/household/meal-plans/${WEEK}/suggestions`, {
      method: 'POST', cookie: owner.cookie, body: JSON.stringify({ slots: validSlots }),
    })).status).toBe(409);
    expect((await request(`/me/household/meal-plans/${WEEK}/entries/${manualId}`, {
      method: 'DELETE', cookie: owner.cookie,
    })).status).toBe(200);
    expect(await prisma.recipe.count({ where: { id: recipe.get('a')!.id } })).toBe(1);
  });

  it('previews deterministically without plan or personal Taste writes and reuses exact family versions', async () => {
    const slots = [
      { plannedDate: '2026-11-04', mealType: 'dinner' },
      { plannedDate: '2026-11-02', mealType: 'lunch' },
      { plannedDate: '2026-11-03', mealType: 'lunch' },
    ];
    const planEntriesBefore = await prisma.householdMealPlanEntry.count({ where: { mealPlan: { householdId, weekStart: new Date(`${WEEK}T00:00:00.000Z`) } } });
    const tasteBefore = {
      profiles: await prisma.tasteProfile.count({ where: { userId: owner.id } }),
      dimensions: await prisma.tasteDimension.count({ where: { tasteProfileId: profileId } }),
      signals: await prisma.tasteSignal.count({ where: { tasteProfileId: profileId } }),
      feedback: await prisma.cookFeedback.count({ where: { cookSession: { userId: owner.id } } }),
    };
    const first = await preview(WEEK, slots);
    const familyCount = await prisma.householdPersonalizedRecipeVersion.count({ where: { householdId } });
    const second = await preview(WEEK, [...slots].reverse());
    expect(second.data).toEqual(first.data);
    expect(first.data.algorithmVersion).toBe('family-meal-plan-v1');
    expect(first.data.slots.map((slot) => `${slot.plannedDate}|${slot.mealType}`)).toEqual([
      '2026-11-02|lunch', '2026-11-03|lunch', '2026-11-04|dinner',
    ]);
    expect(new Set(first.data.slots.map((slot) => slot.recipe.id))).toEqual(new Set([
      recipe.get('a')!.id, recipe.get('b')!.id, recipe.get('c')!.id,
    ]));
    expect(first.data.slots.every((slot) => slot.householdPersonalizedRecipeVersion.algorithmVersion === 'family-personalize-v1')).toBe(true);
    expect(first.data.slots.some((slot) => slot.householdPersonalizedRecipeVersion.id === personalVersionId)).toBe(false);
    const aSlot = first.data.slots.find((slot) => slot.recipe.id === recipe.get('a')!.id)!;
    const bSlot = first.data.slots.find((slot) => slot.recipe.id === recipe.get('b')!.id)!;
    expect(aSlot.reason.recentUseCount).toBe(2);
    expect(bSlot.reason.recentUseCount).toBe(0);
    const aFamily = await prisma.householdPersonalizedRecipeVersion.findUniqueOrThrow({
      where: { id: aSlot.householdPersonalizedRecipeVersion.id },
    });
    expect(aFamily.baseRecipeVersionId).toBe(recipe.get('a')!.latestVersionId);
    expect(await prisma.householdPersonalizedRecipeVersion.count({ where: { householdId } })).toBe(familyCount);
    expect(await prisma.householdMealPlanEntry.count({ where: { mealPlan: { householdId, weekStart: new Date(`${WEEK}T00:00:00.000Z`) } } })).toBe(planEntriesBefore);
    expect({
      profiles: await prisma.tasteProfile.count({ where: { userId: owner.id } }),
      dimensions: await prisma.tasteDimension.count({ where: { tasteProfileId: profileId } }),
      signals: await prisma.tasteSignal.count({ where: { tasteProfileId: profileId } }),
      feedback: await prisma.cookFeedback.count({ where: { cookSession: { userId: owner.id } } }),
    }).toEqual(tasteBefore);
    expect(JSON.stringify(first)).not.toContain('example.com');
    expect(JSON.stringify(first)).not.toContain('privateNote');
  });

  it('ignores unrelated note/order edits in the hash but treats effective Family Taste changes as stale', async () => {
    const other = await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(canonicalEntryBody({
        plannedDate: '2026-11-08', mealType: 'other', note: 'A', sortOrder: 1,
        recipeVersionId: recipe.get('b')!.latestVersionId,
      })),
    });
    const otherId = (await json<{ data: { id: string } }>(other)).data.id;
    const slots = [
      { plannedDate: '2026-11-02', mealType: 'lunch' },
      { plannedDate: '2026-11-03', mealType: 'dinner' },
      { plannedDate: '2026-11-04', mealType: 'lunch' },
    ];
    const beforeEdit = await preview(WEEK, slots);
    expect((await request(`/me/household/meal-plans/${WEEK}/entries/${otherId}`, {
      method: 'PUT', cookie: owner.cookie,
      body: JSON.stringify(canonicalEntryBody({
        plannedDate: '2026-11-08', mealType: 'other', note: 'B', sortOrder: 99,
        recipeVersionId: recipe.get('b')!.latestVersionId,
      })),
    })).status).toBe(200);
    const afterEdit = await preview(WEEK, slots);
    expect(afterEdit.data.suggestionHash).toBe(beforeEdit.data.suggestionHash);

    await prisma.tasteSignal.create({
      data: {
        tasteProfileId: profileId, dimensionKey: 'saltiness', signalValue: 1,
        sourceType: 'cook_feedback', baseWeight: 1, qualityFactor: 0,
        excludedReason: 'technical_issue',
      },
    });
    const nonEffective = await preview(WEEK, slots);
    expect(nonEffective.data.suggestionHash).toBe(afterEdit.data.suggestionHash);
    expect(nonEffective.data.slots.map((slot) => slot.householdPersonalizedRecipeVersion.id))
      .toEqual(afterEdit.data.slots.map((slot) => slot.householdPersonalizedRecipeVersion.id));

    const aSlot = nonEffective.data.slots.find((slot) => slot.recipe.id === recipe.get('a')!.id)!;
    const cooking = await request('/cook-sessions', {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify({
        recipeSlug: aSlot.recipe.slug,
        householdPersonalizedRecipeVersionId: aSlot.householdPersonalizedRecipeVersion.id,
      }),
    });
    const cookingId = (await json<{ data: { id: string } }>(cooking)).data.id;
    expect((await request(`/cook-sessions/${cookingId}/complete`, { method: 'POST', cookie: owner.cookie })).status).toBe(200);
    expect((await request(`/cook-sessions/${cookingId}/feedback`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify({ dimensions: { saltiness: 1 }, privateNote: 'Không được lộ trong gợi ý.' }),
    })).status).toBe(201);
    const changed = await preview(WEEK, slots);
    const changedA = changed.data.slots.find((slot) => slot.recipe.id === recipe.get('a')!.id)!;
    expect(changedA.householdPersonalizedRecipeVersion.id).not.toBe(aSlot.householdPersonalizedRecipeVersion.id);
    expect(changed.data.suggestionHash).not.toBe(nonEffective.data.suggestionHash);
    expect((await apply(WEEK, slots, nonEffective.data.suggestionHash)).status).toBe(409);
    expect(await prisma.householdMealPlanEntry.count({ where: { mealPlan: { householdId, weekStart: new Date(`${WEEK}T00:00:00.000Z`) }, mealType: { in: ['lunch', 'dinner'] } } })).toBe(0);
    await prisma.householdMealPlanEntry.delete({ where: { id: otherId } });
  });

  it('rejects wrong hashes and manual slot changes without partial application', async () => {
    const week = '2026-11-09';
    const slots = [
      { plannedDate: week, mealType: 'lunch' },
      { plannedDate: '2026-11-10', mealType: 'dinner' },
    ];
    await createPlan(week);
    const suggested = await preview(week, slots);
    expect((await apply(week, slots, 'f'.repeat(64))).status).toBe(409);
    expect(await prisma.householdMealPlanEntry.count({ where: { mealPlan: { householdId, weekStart: new Date(`${week}T00:00:00.000Z`) } } })).toBe(0);
    const manual = await request(`/me/household/meal-plans/${week}/entries`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(canonicalEntryBody({ plannedDate: week, mealType: 'lunch' })),
    });
    const manualId = (await json<{ data: { id: string } }>(manual)).data.id;
    expect((await apply(week, slots, suggested.data.suggestionHash)).status).toBe(409);
    expect(await prisma.householdMealPlanEntry.count({ where: { mealPlan: { householdId, weekStart: new Date(`${week}T00:00:00.000Z`) } } })).toBe(1);
    await request(`/me/household/meal-plans/${week}/entries/${manualId}`, { method: 'DELETE', cookie: owner.cookie });
  });

  it('serializes archive before apply and inserts zero stale entries without sleeps', async () => {
    const week = '2026-11-16';
    const slots = [{ plannedDate: week, mealType: 'lunch' }];
    await createPlan(week);
    const suggested = await preview(week, slots);
    const targetRecipeId = suggested.data.slots[0].recipe.id;
    let releaseArchive!: () => void;
    let archiveAcquired!: () => void;
    let applyWaiting!: () => void;
    const gate = new Promise<void>((resolve) => { releaseArchive = resolve; });
    const acquired = new Promise<void>((resolve) => { archiveAcquired = resolve; });
    const waiting = new Promise<void>((resolve) => { applyWaiting = resolve; });
    recipeLock.setTestHook(async (phase, operation, recipeId) => {
      if (recipeId !== targetRecipeId) return;
      if (operation === 'archive' && phase === 'acquired') {
        archiveAcquired();
        await gate;
      }
      if (operation === 'meal_plan_suggestion_apply' && phase === 'before_acquire') applyWaiting();
    });
    const archive = adminRecipes.archive(targetRecipeId);
    await acquired;
    const applying = apply(week, slots, suggested.data.suggestionHash);
    await waiting;
    releaseArchive();
    await archive;
    expect((await applying).status).toBe(409);
    expect(await prisma.householdMealPlanEntry.count({ where: { mealPlan: { householdId, weekStart: new Date(`${week}T00:00:00.000Z`) } } })).toBe(0);
    recipeLock.setTestHook(null);
    await adminRecipes.restore(targetRecipeId);
  });

  it('applies all entries atomically with sorted recipe locks and resolves concurrent identical apply once', async () => {
    const week = '2026-11-23';
    const slots = [
      { plannedDate: week, mealType: 'lunch' },
      { plannedDate: '2026-11-24', mealType: 'dinner' },
      { plannedDate: '2026-11-25', mealType: 'lunch' },
    ];
    await createPlan(week);
    const suggested = await preview(week, slots);
    const acquired: string[] = [];
    recipeLock.setTestHook((phase, operation, recipeId) => {
      if (phase === 'acquired' && operation === 'meal_plan_suggestion_apply') acquired.push(recipeId);
    });
    const response = await apply(week, slots, suggested.data.suggestionHash);
    expect(response.status).toBe(201);
    expect(acquired).toEqual([...new Set(acquired)].sort());
    const appliedEntries = await prisma.householdMealPlanEntry.findMany({
      where: { mealPlan: { householdId, weekStart: new Date(`${week}T00:00:00.000Z`) } },
    });
    expect(appliedEntries).toHaveLength(3);
    expect(appliedEntries.every((entry) => entry.recipeVersionId === null && entry.householdPersonalizedRecipeVersionId !== null)).toBe(true);

    recipeLock.setTestHook(null);
    const concurrentWeek = '2026-11-30';
    const concurrentSlots = [
      { plannedDate: concurrentWeek, mealType: 'lunch' },
      { plannedDate: '2026-12-01', mealType: 'dinner' },
    ];
    await createPlan(concurrentWeek);
    const concurrentPreview = await preview(concurrentWeek, concurrentSlots);
    const raced = await Promise.all([
      apply(concurrentWeek, concurrentSlots, concurrentPreview.data.suggestionHash),
      apply(concurrentWeek, concurrentSlots, concurrentPreview.data.suggestionHash),
    ]);
    expect(raced.filter((item) => item.status === 201)).toHaveLength(1);
    expect(raced.filter((item) => item.status === 409)).toHaveLength(1);
    expect(await prisma.householdMealPlanEntry.count({
      where: { mealPlan: { householdId, weekStart: new Date(`${concurrentWeek}T00:00:00.000Z`) } },
    })).toBe(2);
  });

  it('rechecks current membership during apply and rejects a removed member', async () => {
    const invitation = await json<{ data: { token: string } }>(await request('/me/household/invites', {
      method: 'POST', cookie: owner.cookie,
    }));
    expect((await request('/household-invites/accept', {
      method: 'POST', cookie: member.cookie, body: JSON.stringify({ token: invitation.data.token }),
    })).status).toBe(201);
    const week = '2026-12-07';
    const slots = [{ plannedDate: week, mealType: 'dinner' }];
    await createPlan(week, member);
    const suggested = await preview(week, slots, member);
    const memberRow = await prisma.householdMember.findUniqueOrThrow({ where: { userId: member.id } });
    expect((await request(`/me/household/members/${memberRow.id}`, {
      method: 'DELETE', cookie: owner.cookie,
    })).status).toBe(200);
    expect((await apply(week, slots, suggested.data.suggestionHash, member)).status).toBe(404);
    expect(await prisma.householdMealPlanEntry.count({
      where: { mealPlan: { householdId, weekStart: new Date(`${week}T00:00:00.000Z`) } },
    })).toBe(0);
  });
});

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
const PASSWORD = 'Phase13a-meal-plan-password!';
const WEEK = '2026-10-12';

type Account = { id: string; cookie: string };

describe('Phase 13A household meal planning (HTTP integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const prefix = `phase13a-${runId}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let adminRecipes: AdminRecipesService;
  let recipeLock: RecipePublishLockService;
  let base: string;
  const userIds: string[] = [];
  const householdIds: string[] = [];
  const recipeIds: string[] = [];
  let owner: Account;
  let member: Account;
  let outsider: Account;
  let foreignOwner: Account;
  let deletingMember: Account;
  let householdId: string;
  let foreignHouseholdId: string;
  let recipeId: string;
  let recipeVersionId: string;
  let raceRecipeId: string;
  let raceRecipeVersionId: string;
  let householdVersionId: string;
  let foreignHouseholdVersionId: string;
  let personalVersionId: string;
  let planId: string;
  let canonicalEntryId: string;

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
      method: 'POST',
      body: JSON.stringify({ email: `${prefix}-${label}@example.com`, password: PASSWORD }),
    });
    expect(response.status).toBe(201);
    const result = await json<{ data: { user: { id: string } } }>(response);
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Expected session cookie.');
    userIds.push(result.data.user.id);
    return { id: result.data.user.id, cookie };
  }

  async function createHousehold(account: Account, name: string) {
    const response = await request('/me/household', {
      method: 'POST', cookie: account.cookie, body: JSON.stringify({ name }),
    });
    expect(response.status).toBe(201);
    const result = await json<{ data: { id: string } }>(response);
    householdIds.push(result.data.id);
    return result.data.id;
  }

  async function invite(account: Account, invitee: Account) {
    const created = await request('/me/household/invites', { method: 'POST', cookie: account.cookie });
    const inviteBody = await json<{ data: { token: string } }>(created);
    expect((await request('/household-invites/accept', {
      method: 'POST', cookie: invitee.cookie, body: JSON.stringify({ token: inviteBody.data.token }),
    })).status).toBe(201);
  }

  function entryBody(overrides: Record<string, unknown> = {}) {
    return {
      plannedDate: WEEK,
      mealType: 'dinner',
      sortOrder: 0,
      recipeVersionId,
      householdPersonalizedRecipeVersionId: null,
      servings: 4,
      note: 'Ghi chú riêng của gia đình',
      ...overrides,
    };
  }

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_KEY_PREFIX = `${prefix}:auth`;
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    adminRecipes = app.get(AdminRecipesService);
    recipeLock = app.get(RecipePublishLockService);
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;

    [owner, member, outsider, foreignOwner, deletingMember] = await Promise.all([
      register('owner'), register('member'), register('outsider'), register('foreign'), register('deleting-member'),
    ]);
    householdId = await createHousehold(owner, 'Nhà lập kế hoạch');
    foreignHouseholdId = await createHousehold(foreignOwner, 'Nhà bên ngoài');
    await invite(owner, member);
    await invite(owner, deletingMember);

    const recipe = await prisma.recipe.create({
      data: {
        slug: `${prefix}-canonical`, canonicalTitle: 'Món kế hoạch', status: 'published',
        versions: { create: { versionNo: 1, servings: 4, contentHash: `${runId}a`, publishedAt: new Date() } },
      },
      include: { versions: true },
    });
    recipeId = recipe.id;
    recipeVersionId = recipe.versions[0].id;
    recipeIds.push(recipe.id);
    const raceRecipe = await prisma.recipe.create({
      data: {
        slug: `${prefix}-race`, canonicalTitle: 'Món kiểm thử khóa', status: 'published',
        versions: { create: { versionNo: 1, servings: 2, contentHash: `${runId}b`, publishedAt: new Date() } },
      },
      include: { versions: true },
    });
    raceRecipeId = raceRecipe.id;
    raceRecipeVersionId = raceRecipe.versions[0].id;
    recipeIds.push(raceRecipe.id);

    const family = await prisma.householdPersonalizedRecipeVersion.create({
      data: {
        householdId, recipeId, baseRecipeVersionId: recipeVersionId, versionNo: 1,
        algorithmVersion: 'family-personalize-v1', contentHash: `${runId}c`,
        familyTasteSnapshotJson: {} as Prisma.InputJsonValue,
        snapshotJson: {} as Prisma.InputJsonValue,
      },
    });
    householdVersionId = family.id;
    const foreignFamily = await prisma.householdPersonalizedRecipeVersion.create({
      data: {
        householdId: foreignHouseholdId, recipeId, baseRecipeVersionId: recipeVersionId, versionNo: 1,
        algorithmVersion: 'family-personalize-v1', contentHash: `${runId}d`,
        familyTasteSnapshotJson: {} as Prisma.InputJsonValue,
        snapshotJson: {} as Prisma.InputJsonValue,
      },
    });
    foreignHouseholdVersionId = foreignFamily.id;
    const profile = await prisma.tasteProfile.create({ data: { userId: owner.id, algorithmVersion: 'taste-v1' } });
    const personal = await prisma.personalizedRecipeVersion.create({
      data: {
        userId: owner.id, recipeId, baseRecipeVersionId: recipeVersionId, tasteProfileId: profile.id,
        versionNo: 1, algorithmVersion: 'personalize-v3', contentHash: `${runId}e`,
        adjustmentJson: [] as Prisma.InputJsonValue, snapshotJson: {} as Prisma.InputJsonValue,
      },
    });
    personalVersionId = personal.id;
  });

  afterAll(async () => {
    recipeLock.setTestHook(null);
    await prisma.householdMealPlanEntry.deleteMany({ where: { mealPlan: { householdId: { in: householdIds } } } });
    await prisma.householdMealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: recipeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('creates one Monday plan idempotently and authorizes only current members', async () => {
    expect((await request('/me/household/meal-plans', {
      method: 'POST', cookie: owner.cookie, body: JSON.stringify({ weekStart: '2026-10-11' }),
    })).status).toBe(400);

    const concurrent = await Promise.all([
      request('/me/household/meal-plans', { method: 'POST', cookie: owner.cookie, body: JSON.stringify({ weekStart: WEEK }) }),
      request('/me/household/meal-plans', { method: 'POST', cookie: member.cookie, body: JSON.stringify({ weekStart: WEEK }) }),
    ]);
    expect(concurrent.map((response) => response.status)).toEqual([201, 201]);
    const bodies = await Promise.all(concurrent.map((response) => json<{ data: { id: string; reused: boolean } }>(response)));
    expect(new Set(bodies.map((item) => item.data.id)).size).toBe(1);
    expect(bodies.filter((item) => item.data.reused)).toHaveLength(1);
    planId = bodies[0].data.id;
    expect(await prisma.householdMealPlan.count({ where: { householdId, weekStart: new Date(`${WEEK}T00:00:00.000Z`) } })).toBe(1);
    expect((await request(`/me/household/meal-plans/${WEEK}`, { cookie: member.cookie })).status).toBe(200);
    expect((await request(`/me/household/meal-plans/${WEEK}`, { cookie: outsider.cookie })).status).toBe(404);
    expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: outsider.cookie, body: JSON.stringify(entryBody()),
    })).status).toBe(404);

    expect((await request('/me/household/meal-plans', {
      method: 'POST', cookie: foreignOwner.cookie, body: JSON.stringify({ weekStart: '2026-10-19' }),
    })).status).toBe(201);
    expect((await request('/me/household/meal-plans/2026-10-19', { cookie: owner.cookie })).status).toBe(404);
  });

  it('enforces dates, slot conflicts, and canonical/family provenance', async () => {
    expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: member.cookie,
      body: JSON.stringify(entryBody({ plannedDate: '2026-10-19' })),
    })).status).toBe(400);

    const canonical = await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: member.cookie, body: JSON.stringify(entryBody()),
    });
    expect(canonical.status).toBe(201);
    canonicalEntryId = (await json<{ data: { id: string; recipeVersion: { id: string } } }>(canonical)).data.id;

    for (const mealType of ['breakfast', 'lunch'] as const) {
      expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
        method: 'POST', cookie: owner.cookie,
        body: JSON.stringify(entryBody({ mealType, plannedDate: '2026-10-13' })),
      })).status).toBe(201);
      expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
        method: 'POST', cookie: owner.cookie,
        body: JSON.stringify(entryBody({ mealType, plannedDate: '2026-10-13' })),
      })).status).toBe(409);
    }
    expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie, body: JSON.stringify(entryBody()),
    })).status).toBe(409);

    const otherResponses = await Promise.all([0, 1].map((sortOrder) => request(
      `/me/household/meal-plans/${WEEK}/entries`,
      {
        method: 'POST', cookie: owner.cookie,
        body: JSON.stringify(entryBody({ mealType: 'other', sortOrder, plannedDate: '2026-10-14' })),
      },
    )));
    expect(otherResponses.map((response) => response.status)).toEqual([201, 201]);

    expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(entryBody({
        mealType: 'other', plannedDate: '2026-10-15', recipeVersionId: null,
        householdPersonalizedRecipeVersionId: householdVersionId,
      })),
    })).status).toBe(201);
    expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(entryBody({
        mealType: 'other', plannedDate: '2026-10-15', recipeVersionId: null,
        householdPersonalizedRecipeVersionId: foreignHouseholdVersionId,
      })),
    })).status).toBe(404);
    expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(entryBody({
        mealType: 'other', plannedDate: '2026-10-15', personalizedRecipeVersionId: personalVersionId,
      })),
    })).status).toBe(400);
    expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(entryBody({ mealType: 'other', plannedDate: '2026-10-15', recipeVersionId: personalVersionId })),
    })).status).toBe(404);

    await adminRecipes.archive(recipeId);
    expect((await request(`/me/household/meal-plans/${WEEK}`, { cookie: owner.cookie })).status).toBe(200);
    expect((await request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(entryBody({ mealType: 'other', plannedDate: '2026-10-16' })),
    })).status).toBe(409);
    expect((await request(`/me/household/meal-plans/${WEEK}/entries/${canonicalEntryId}`, {
      method: 'PUT', cookie: member.cookie,
      body: JSON.stringify(entryBody({ note: 'Lịch sử vẫn có thể cập nhật khi không đổi nguồn.' })),
    })).status).toBe(200);
  });

  it('serializes recipe archive against a new entry without sleeps', async () => {
    let releaseArchive!: () => void;
    let archiveAcquired!: () => void;
    let entryWaiting!: () => void;
    const archiveGate = new Promise<void>((resolve) => { releaseArchive = resolve; });
    const acquired = new Promise<void>((resolve) => { archiveAcquired = resolve; });
    const waiting = new Promise<void>((resolve) => { entryWaiting = resolve; });
    recipeLock.setTestHook(async (phase, operation, lockedRecipeId) => {
      if (lockedRecipeId !== raceRecipeId) return;
      if (operation === 'archive' && phase === 'acquired') {
        archiveAcquired();
        await archiveGate;
      }
      if (operation === 'meal_plan_entry' && phase === 'before_acquire') entryWaiting();
    });

    const archive = adminRecipes.archive(raceRecipeId);
    await acquired;
    const create = request(`/me/household/meal-plans/${WEEK}/entries`, {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(entryBody({
        mealType: 'other', plannedDate: '2026-10-17', recipeVersionId: raceRecipeVersionId,
      })),
    });
    await waiting;
    releaseArchive();
    await archive;
    expect((await create).status).toBe(409);
    expect(await prisma.householdMealPlanEntry.count({ where: { recipeId: raceRecipeId } })).toBe(0);
    recipeLock.setTestHook(null);
  });

  it('revokes removed-member access and preserves shared history on creator deletion', async () => {
    const memberRow = await prisma.householdMember.findUniqueOrThrow({ where: { userId: member.id } });
    expect((await request(`/me/household/members/${memberRow.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(200);
    expect((await request(`/me/household/meal-plans/${WEEK}`, { cookie: member.cookie })).status).toBe(404);

    const deletionWeek = '2026-10-26';
    expect((await request('/me/household/meal-plans', {
      method: 'POST', cookie: deletingMember.cookie, body: JSON.stringify({ weekStart: deletionWeek }),
    })).status).toBe(201);
    const createdEntry = await request(`/me/household/meal-plans/${deletionWeek}/entries`, {
      method: 'POST', cookie: deletingMember.cookie,
      body: JSON.stringify(entryBody({ plannedDate: deletionWeek, mealType: 'other' })),
    });
    expect(createdEntry.status).toBe(409);
    await adminRecipes.restore(recipeId);
    const retriedEntry = await request(`/me/household/meal-plans/${deletionWeek}/entries`, {
      method: 'POST', cookie: deletingMember.cookie,
      body: JSON.stringify(entryBody({ plannedDate: deletionWeek, mealType: 'other' })),
    });
    expect(retriedEntry.status).toBe(201);
    const deletionPlan = await prisma.householdMealPlan.findUniqueOrThrow({
      where: { householdId_weekStart: { householdId, weekStart: new Date(`${deletionWeek}T00:00:00.000Z`) } },
      include: { entries: true },
    });

    expect((await request('/me/account', {
      method: 'DELETE', cookie: deletingMember.cookie,
      body: JSON.stringify({ password: PASSWORD, confirm: 'DELETE' }),
    })).status).toBe(200);
    const preserved = await prisma.householdMealPlan.findUniqueOrThrow({
      where: { id: deletionPlan.id }, include: { entries: true },
    });
    expect(preserved.createdByUserId).toBeNull();
    expect(preserved.entries).toHaveLength(1);
    expect(preserved.entries[0].createdByUserId).toBeNull();
    expect((await request(`/me/household/meal-plans/${deletionWeek}`, { cookie: owner.cookie })).status).toBe(200);

    const recipeCount = await prisma.recipe.count({ where: { id: recipeId } });
    const versionCount = await prisma.recipeVersion.count({ where: { id: recipeVersionId } });
    expect((await request(`/me/household/meal-plans/${WEEK}/entries/${canonicalEntryId}`, {
      method: 'DELETE', cookie: owner.cookie,
    })).status).toBe(200);
    expect(await prisma.recipe.count({ where: { id: recipeId } })).toBe(recipeCount);
    expect(await prisma.recipeVersion.count({ where: { id: recipeVersionId } })).toBe(versionCount);
    expect(await prisma.householdMealPlan.findUnique({ where: { id: planId } })).not.toBeNull();

    await prisma.household.update({ where: { id: householdId }, data: { status: 'closed' } });
    expect((await request(`/me/household/meal-plans/${deletionWeek}`, { cookie: owner.cookie })).status).toBe(200);
    expect((await request('/me/household/meal-plans', {
      method: 'POST', cookie: owner.cookie, body: JSON.stringify({ weekStart: '2026-11-02' }),
    })).status).toBe(404);
    await prisma.household.update({ where: { id: householdId }, data: { status: 'active' } });
  });
});

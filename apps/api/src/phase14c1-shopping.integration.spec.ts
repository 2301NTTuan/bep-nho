import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';
import { configureHttp } from './http/configure-http';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Phase14c1-shopping-password!';
const WEEK = '2026-11-02';
const EMPTY_WEEK = '2026-11-09';
const HOUSEHOLD_WEEK = '2026-11-16';

type Account = { id: string; cookie: string };
type Preview = {
  data: {
    algorithmVersion: string;
    weekStart: string;
    inputHash: string;
    summary: {
      mealEntryCount: number; requirementLineCount: number; missingLineCount: number;
      fullyCoveredLineCount: number; unitMismatchCount: number;
    };
    items: Array<{
      ingredient: { id: string; slug: string; name: string; category: string | null };
      unit: string; requiredQuantity: number; pantryQuantityApplied: number; missingQuantity: number;
      pantry: { present: boolean; unit: string | null; unitMatches: boolean };
      sourceEntryCount: number;
    }>;
  };
};

describe('Phase 14C1 household shopping requirements (HTTP integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const prefix = `phase14c1-${runId}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let owner: Account;
  let member: Account;
  let outsider: Account;
  let creator: Account;
  let foreignOwner: Account;
  let householdId: string;
  let foreignHouseholdId: string;
  let planId: string;
  let recipeId: string;
  let oldVersionId: string;
  let newVersionId: string;
  let familyVersionId: string;
  let ingredientLinearId: string;
  let ingredientConservativeId: string;
  let ingredientFixedId: string;
  let ingredientRoundedId: string;
  const userIds: string[] = [];
  const householdIds: string[] = [];
  const recipeIds: string[] = [];
  const ingredientIds: string[] = [];

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
    const invite = await json<{ data: { token: string } }>(created);
    expect((await request('/household-invites/accept', {
      method: 'POST', cookie: invitee.cookie, body: JSON.stringify({ token: invite.data.token }),
    })).status).toBe(201);
  }

  async function preview(week = WEEK, account = owner) {
    const response = await request(`/me/household/meal-plans/${week}/shopping-requirements`, { cookie: account.cookie });
    return { response, body: response.status === 200 ? await json<Preview>(response) : null };
  }

  async function generate(expectedInputHash: string, week = WEEK, account = owner) {
    return request(`/me/household/meal-plans/${week}/shopping-list`, {
      method: 'POST', cookie: account.cookie, body: JSON.stringify({ expectedInputHash }),
    });
  }

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_KEY_PREFIX = `${prefix}:auth`;
    process.env.AUTH_RATE_LIMIT_REGISTER_POINTS = '10000';
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;

    [owner, member, outsider, creator, foreignOwner] = await Promise.all([
      register('owner'), register('member'), register('outsider'), register('creator'), register('foreign'),
    ]);
    householdId = await createHousehold(owner, 'Nhà mua sắm');
    foreignHouseholdId = await createHousehold(foreignOwner, 'Nhà khác');
    await invite(owner, member);
    await invite(owner, creator);

    const ingredients = await Promise.all([
      prisma.ingredient.create({ data: { slug: `${prefix}-linear`, canonicalName: 'A Linear', category: 'produce' } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-conservative`, canonicalName: 'B Conservative', category: 'seasoning' } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-fixed`, canonicalName: 'C Fixed', category: null } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-rounded`, canonicalName: 'D Rounded', category: 'dry' } }),
    ]);
    ingredientIds.push(...ingredients.map((item) => item.id));
    [ingredientLinearId, ingredientConservativeId, ingredientFixedId, ingredientRoundedId] = ingredients.map((item) => item.id);

    const recipe = await prisma.recipe.create({
      data: { slug: `${prefix}-recipe`, canonicalTitle: 'Shopping exact source', status: 'published' },
    });
    recipeId = recipe.id;
    recipeIds.push(recipe.id);
    const oldVersion = await prisma.recipeVersion.create({
      data: {
        recipeId, versionNo: 1, servings: 4, contentHash: `${prefix}-v1`, publishedAt: new Date(),
        ingredients: { create: [
          { ingredientId: ingredientLinearId, quantity: 100, unit: 'g', sortOrder: 1, scalingMode: 'LINEAR', scalingExponent: 1, roundingIncrement: 1 },
          { ingredientId: ingredientConservativeId, quantity: 10, unit: 'ml', sortOrder: 2, scalingMode: 'CONSERVATIVE', scalingExponent: 0.5, roundingIncrement: 1 },
          { ingredientId: ingredientFixedId, quantity: 2, unit: 'piece', sortOrder: 3, scalingMode: 'FIXED', scalingExponent: 1, roundingIncrement: 1 },
          { ingredientId: ingredientRoundedId, quantity: 7, unit: 'ml', sortOrder: 4, scalingMode: 'CONSERVATIVE', scalingExponent: 0.75, roundingIncrement: 1 },
        ] },
      },
    });
    oldVersionId = oldVersion.id;
    const newVersion = await prisma.recipeVersion.create({
      data: {
        recipeId, versionNo: 2, servings: 4, contentHash: `${prefix}-v2`, publishedAt: new Date(),
        ingredients: { create: {
          ingredientId: ingredientLinearId, quantity: 999, unit: 'g', sortOrder: 1,
          scalingMode: 'LINEAR', scalingExponent: 1, roundingIncrement: 1,
        } },
      },
    });
    newVersionId = newVersion.id;
    const secondaryRecipe = await prisma.recipe.create({
      data: { slug: `${prefix}-secondary`, canonicalTitle: 'Shopping alternate unit', status: 'published' },
    });
    recipeIds.push(secondaryRecipe.id);
    const secondaryVersion = await prisma.recipeVersion.create({
      data: {
        recipeId: secondaryRecipe.id, versionNo: 1, servings: 4,
        contentHash: `${prefix}-secondary-v1`, publishedAt: new Date(),
        ingredients: { create: {
          ingredientId: ingredientLinearId, quantity: 1, unit: 'kg', sortOrder: 1,
          scalingMode: 'LINEAR', scalingExponent: 1, roundingIncrement: 0.001,
        } },
      },
    });
    const plan = await prisma.householdMealPlan.create({
      data: { householdId, weekStart: new Date(`${WEEK}T00:00:00.000Z`), createdByUserId: owner.id },
    });
    planId = plan.id;
    await prisma.householdMealPlan.create({
      data: { householdId, weekStart: new Date(`${EMPTY_WEEK}T00:00:00.000Z`), createdByUserId: owner.id },
    });
    await prisma.householdMealPlanEntry.createMany({ data: [
      {
        mealPlanId: plan.id, plannedDate: new Date(`${WEEK}T00:00:00.000Z`), mealType: 'lunch',
        recipeId, recipeVersionId: oldVersionId, servings: 8, createdByUserId: owner.id,
      },
      {
        mealPlanId: plan.id, plannedDate: new Date('2026-11-03T00:00:00.000Z'), mealType: 'dinner',
        recipeId, recipeVersionId: oldVersionId, servings: 8, createdByUserId: owner.id,
      },
      {
        mealPlanId: plan.id, plannedDate: new Date('2026-11-03T00:00:00.000Z'), mealType: 'other',
        sortOrder: 1, recipeId: secondaryRecipe.id, recipeVersionId: secondaryVersion.id,
        servings: 8, createdByUserId: owner.id,
      },
    ] });
    await prisma.householdPantryItem.createMany({ data: [
      { householdId, ingredientId: ingredientLinearId, quantity: 150, unit: 'g', createdByUserId: owner.id, updatedByUserId: owner.id },
      { householdId, ingredientId: ingredientConservativeId, quantity: 1, unit: 'tbsp', createdByUserId: owner.id, updatedByUserId: owner.id },
      { householdId, ingredientId: ingredientFixedId, quantity: 10, unit: 'piece', createdByUserId: owner.id, updatedByUserId: owner.id },
    ] });
  });

  afterAll(async () => {
    await prisma.householdShoppingListItem.deleteMany({ where: { shoppingList: { householdId: { in: householdIds } } } });
    await prisma.householdShoppingList.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdPantryItem.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMealPlanEntry.deleteMany({ where: { mealPlan: { householdId: { in: householdIds } } } });
    await prisma.householdMealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: recipeIds } } });
    await prisma.ingredient.deleteMany({ where: { id: { in: ingredientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('returns 404 for a missing plan and deterministic zero requirements for an empty plan', async () => {
    expect((await preview('2026-11-23')).response.status).toBe(404);
    const first = await preview(EMPTY_WEEK);
    const second = await preview(EMPTY_WEEK);
    expect(first.response.status).toBe(200);
    expect(first.body?.data).toEqual(second.body?.data);
    expect(first.body?.data).toMatchObject({
      algorithmVersion: 'shopping-requirements-v1',
      summary: { mealEntryCount: 0, requirementLineCount: 0, missingLineCount: 0, fullyCoveredLineCount: 0 },
      items: [],
    });
    const generated = await generate(first.body!.data.inputHash, EMPTY_WEEK);
    expect(generated.status).toBe(201);
    expect(await prisma.householdShoppingList.count({ where: { householdId, weekStart: new Date(`${EMPTY_WEEK}T00:00:00.000Z`) } })).toBe(0);
  });

  it('uses exact canonical provenance and shared Cook scaling with deterministic aggregation and ordering', async () => {
    const first = await preview();
    const second = await preview();
    expect(first.response.status).toBe(200);
    expect(second.body?.data).toEqual(first.body?.data);
    const data = first.body!.data;
    expect(data.summary).toEqual({
      mealEntryCount: 3, requirementLineCount: 5, missingLineCount: 4,
      fullyCoveredLineCount: 1, unitMismatchCount: 2,
    });
    expect(data.items.map((item) => `${item.ingredient.name}|${item.unit}`)).toEqual([
      'A Linear|g', 'A Linear|kg', 'B Conservative|ml', 'D Rounded|ml',
    ]);
    expect(data.items[0]).toMatchObject({
      unit: 'g', requiredQuantity: 400, pantryQuantityApplied: 150, missingQuantity: 250,
      sourceEntryCount: 2, pantry: { present: true, unit: 'g', unitMatches: true },
    });
    expect(data.items[1]).toMatchObject({
      unit: 'kg', requiredQuantity: 2, pantryQuantityApplied: 0, missingQuantity: 2,
      sourceEntryCount: 1, pantry: { present: true, unit: 'g', unitMatches: false },
    });
    expect(data.items[2]).toMatchObject({
      unit: 'ml', requiredQuantity: 28, pantryQuantityApplied: 0, missingQuantity: 28,
      pantry: { present: true, unit: 'tbsp', unitMatches: false },
    });
    expect(data.items[3]).toMatchObject({ unit: 'ml', requiredQuantity: 24, missingQuantity: 24 });
    expect(data.items.every((item) => item.requiredQuantity !== 1998)).toBe(true);
    expect(data.items[0].ingredient).toEqual(expect.objectContaining({
      id: ingredientLinearId, slug: `${prefix}-linear`, name: 'A Linear', category: 'produce',
    }));
  });

  it('uses the exact household snapshot without regenerating Family Taste', async () => {
    const snapshot = {
      servings: 4,
      ingredients: [
        { id: ingredientLinearId, slug: `${prefix}-linear`, name: 'A Linear', category: 'produce', baseQuantity: 100, quantity: 150, personalizationFactor: 1.5, unit: 'g', sortOrder: 1, scalingMode: 'LINEAR', scalingExponent: 1, roundingIncrement: 1 },
        { id: ingredientConservativeId, slug: `${prefix}-conservative`, name: 'B Conservative', category: 'seasoning', baseQuantity: 10, quantity: 10, personalizationFactor: 1, unit: 'ml', sortOrder: 2, scalingMode: 'CONSERVATIVE', scalingExponent: 0.5, roundingIncrement: 1 },
        { id: ingredientFixedId, slug: `${prefix}-fixed`, name: 'C Fixed', category: null, baseQuantity: 2, quantity: 2, personalizationFactor: 1, unit: 'piece', sortOrder: 3, scalingMode: 'FIXED', scalingExponent: 1, roundingIncrement: 1 },
        { id: ingredientRoundedId, slug: `${prefix}-rounded`, name: 'D Rounded', category: 'dry', baseQuantity: 7, quantity: 7, personalizationFactor: 1, unit: 'ml', sortOrder: 4, scalingMode: 'CONSERVATIVE', scalingExponent: 0.75, roundingIncrement: 1 },
      ],
    };
    const family = await prisma.householdPersonalizedRecipeVersion.create({
      data: {
        householdId, recipeId, baseRecipeVersionId: oldVersionId, versionNo: 1,
        algorithmVersion: 'family-personalize-v1', contentHash: `${prefix}-family`,
        familyTasteSnapshotJson: { algorithmVersion: 'family-taste-v1' },
        snapshotJson: snapshot as Prisma.InputJsonValue,
      },
    });
    familyVersionId = family.id;
    const plan = await prisma.householdMealPlan.create({
      data: { householdId, weekStart: new Date(`${HOUSEHOLD_WEEK}T00:00:00.000Z`), createdByUserId: owner.id },
    });
    await prisma.householdMealPlanEntry.create({
      data: {
        mealPlanId: plan.id, plannedDate: new Date(`${HOUSEHOLD_WEEK}T00:00:00.000Z`), mealType: 'dinner',
        recipeId, householdPersonalizedRecipeVersionId: family.id, servings: 8, createdByUserId: owner.id,
      },
    });
    const versionsBefore = await prisma.householdPersonalizedRecipeVersion.count({ where: { householdId } });
    const result = await preview(HOUSEHOLD_WEEK);
    expect(result.response.status).toBe(200);
    expect(result.body!.data.items.find((item) => item.ingredient.id === ingredientLinearId)).toMatchObject({
      requiredQuantity: 300, pantryQuantityApplied: 150, missingQuantity: 150,
    });
    expect(await prisma.householdPersonalizedRecipeVersion.count({ where: { householdId } })).toBe(versionsBefore);
  });

  it('hashes material plan/pantry state, excludes notes, and preview performs no writes', async () => {
    const before = {
      lists: await prisma.householdShoppingList.count({ where: { householdId } }),
      plans: await prisma.householdMealPlan.count({ where: { householdId } }),
      pantry: await prisma.householdPantryItem.count({ where: { householdId } }),
      taste: await prisma.tasteProfile.count({ where: { userId: { in: [owner.id, member.id] } } }),
      sessions: await prisma.cookSession.count({ where: { userId: { in: [owner.id, member.id] } } }),
    };
    const initial = (await preview()).body!.data.inputHash;
    await prisma.householdPantryItem.updateMany({
      where: { householdId, ingredientId: ingredientLinearId }, data: { note: 'ignored note' },
    });
    expect((await preview()).body!.data.inputHash).toBe(initial);
    await prisma.householdPantryItem.updateMany({
      where: { householdId, ingredientId: ingredientLinearId }, data: { quantity: 151, revision: { increment: 1 } },
    });
    const pantryChanged = (await preview()).body!.data.inputHash;
    expect(pantryChanged).not.toBe(initial);
    await prisma.householdMealPlanEntry.updateMany({
      where: { mealPlanId: planId }, data: { servings: 7 },
    });
    expect((await preview()).body!.data.inputHash).not.toBe(pantryChanged);
    await prisma.householdMealPlanEntry.updateMany({ where: { mealPlanId: planId }, data: { servings: 8 } });
    const versionState = (await preview()).body!.data.inputHash;
    const exactEntry = await prisma.householdMealPlanEntry.findFirstOrThrow({
      where: { mealPlanId: planId, recipeId, recipeVersionId: oldVersionId }, orderBy: { id: 'asc' },
    });
    await prisma.householdMealPlanEntry.update({ where: { id: exactEntry.id }, data: { recipeVersionId: newVersionId } });
    expect((await preview()).body!.data.inputHash).not.toBe(versionState);
    await prisma.householdMealPlanEntry.update({ where: { id: exactEntry.id }, data: { recipeVersionId: oldVersionId } });
    expect({
      lists: await prisma.householdShoppingList.count({ where: { householdId } }),
      plans: await prisma.householdMealPlan.count({ where: { householdId } }),
      pantry: await prisma.householdPantryItem.count({ where: { householdId } }),
      taste: await prisma.tasteProfile.count({ where: { userId: { in: [owner.id, member.id] } } }),
      sessions: await prisma.cookSession.count({ where: { userId: { in: [owner.id, member.id] } } }),
    }).toEqual(before);
  });

  it('rejects stale generation after pantry or plan changes and inserts nothing', async () => {
    const first = (await preview()).body!.data;
    await prisma.householdPantryItem.updateMany({
      where: { householdId, ingredientId: ingredientLinearId }, data: { quantity: 152, revision: { increment: 1 } },
    });
    expect((await generate(first.inputHash)).status).toBe(409);
    expect(await prisma.householdShoppingList.count({ where: { householdId, weekStart: new Date(`${WEEK}T00:00:00.000Z`) } })).toBe(0);
    const next = (await preview()).body!.data;
    await prisma.householdMealPlanEntry.updateMany({ where: { mealPlanId: planId }, data: { servings: 7 } });
    expect((await generate(next.inputHash)).status).toBe(409);
    expect(await prisma.householdShoppingList.count({ where: { householdId, weekStart: new Date(`${WEEK}T00:00:00.000Z`) } })).toBe(0);
    await prisma.householdMealPlanEntry.updateMany({ where: { mealPlanId: planId }, data: { servings: 8 } });
  });

  it('atomically deduplicates concurrent generation and versions changed effective content', async () => {
    const before = {
      pantry: await prisma.householdPantryItem.findMany({ where: { householdId }, orderBy: { id: 'asc' } }),
      entries: await prisma.householdMealPlanEntry.findMany({ where: { mealPlanId: planId }, orderBy: { id: 'asc' } }),
      taste: await prisma.tasteProfile.count(),
      versions: await prisma.recipeVersion.count({ where: { recipeId } }),
    };
    const current = (await preview()).body!.data;
    const concurrent = await Promise.all([generate(current.inputHash), generate(current.inputHash, WEEK, member)]);
    expect(concurrent.map((response) => response.status)).toEqual([201, 201]);
    const generated = await Promise.all(concurrent.map((response) => json<{ data: { shoppingList: { id: string; versionNo: number; contentHash: string }; reused: boolean } }>(response)));
    expect(new Set(generated.map((item) => item.data.shoppingList.id)).size).toBe(1);
    expect(generated.map((item) => item.data.reused).sort()).toEqual([false, true]);
    expect(await prisma.householdShoppingList.count({ where: { householdId, weekStart: new Date(`${WEEK}T00:00:00.000Z`) } })).toBe(1);
    expect(await prisma.householdPantryItem.findMany({ where: { householdId }, orderBy: { id: 'asc' } })).toEqual(before.pantry);
    expect(await prisma.householdMealPlanEntry.findMany({ where: { mealPlanId: planId }, orderBy: { id: 'asc' } })).toEqual(before.entries);

    await prisma.householdPantryItem.updateMany({
      where: { householdId, ingredientId: ingredientLinearId }, data: { quantity: 200, revision: { increment: 1 } },
    });
    const changed = (await preview()).body!.data;
    const second = await generate(changed.inputHash);
    expect(second.status).toBe(201);
    const secondBody = await json<{ data: { shoppingList: { versionNo: number; contentHash: string }; reused: boolean } }>(second);
    expect(secondBody.data).toMatchObject({ reused: false, shoppingList: { versionNo: 2 } });
    expect(secondBody.data.shoppingList.contentHash).not.toBe(generated[0].data.shoppingList.contentHash);
    expect(await prisma.householdPantryItem.findMany({ where: { householdId }, orderBy: { id: 'asc' } })).toEqual(expect.arrayContaining(before.pantry.map((item) => expect.objectContaining({ id: item.id }))));
    expect(await prisma.householdMealPlanEntry.findMany({ where: { mealPlanId: planId }, orderBy: { id: 'asc' } })).toEqual(before.entries);
    expect(await prisma.tasteProfile.count()).toBe(before.taste);
    expect(await prisma.recipeVersion.count({ where: { recipeId } })).toBe(before.versions);
  });

  it('uses current membership, owner-scopes reads, preserves archived history and creator deletion', async () => {
    await prisma.recipe.update({ where: { id: recipeId }, data: { status: 'archived' } });
    expect((await preview()).response.status).toBe(200);
    await prisma.householdPantryItem.updateMany({
      where: { householdId, ingredientId: ingredientLinearId }, data: { quantity: 201, revision: { increment: 1 } },
    });
    const current = (await preview()).body!.data;
    const created = await generate(current.inputHash, WEEK, creator);
    expect(created.status).toBe(201);
    const createdBody = await json<{ data: { shoppingList: { id: string } } }>(created);
    const listId = createdBody.data.shoppingList.id;
    expect((await request(`/me/household/shopping-lists/${listId}`, { cookie: outsider.cookie })).status).toBe(404);
    expect((await request(`/me/household/shopping-lists/${listId}`, { cookie: foreignOwner.cookie })).status).toBe(404);
    expect((await request(`/me/household/shopping-lists/${listId}`, { cookie: member.cookie })).status).toBe(200);
    expect((await request(`/me/household/meal-plans/${WEEK}/shopping-list/latest`, { cookie: member.cookie })).status).toBe(200);

    expect((await request('/me/account', {
      method: 'DELETE', cookie: creator.cookie, body: JSON.stringify({ password: PASSWORD, confirm: 'DELETE' }),
    })).status).toBe(200);
    expect((await prisma.householdShoppingList.findUniqueOrThrow({ where: { id: listId } })).createdByUserId).toBeNull();

    await prisma.householdMember.delete({ where: { userId: member.id } });
    expect((await preview(WEEK, member)).response.status).toBe(404);
    expect((await generate(current.inputHash, WEEK, member)).status).toBe(404);
    expect((await request(`/me/household/shopping-lists/${listId}`, { cookie: member.cookie })).status).toBe(404);
    await expect(prisma.ingredient.delete({ where: { id: ingredientLinearId } })).rejects.toMatchObject({ code: 'P2003' });
  });
});

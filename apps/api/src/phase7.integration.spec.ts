import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { config } from 'dotenv';
import { scaleIngredientQuantity } from '@bep-nho/domain';
import { CookSessionsService } from './cook-sessions/cook-sessions.service';
import { PrismaService } from './database/prisma.service';
import { PersonalizationService } from './personalization/personalization.service';

config({ path: resolve(__dirname, '../../../.env') });

describe('Phase 7 snapshots and resumable sessions (database integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const slug = `phase7-recipe-${runId}`;
  const prisma = new PrismaService();
  const cooking = new CookSessionsService(prisma);
  const personalization = new PersonalizationService(prisma);
  const userIds: string[] = [];
  let recipeId: string;
  let ingredientId: string;
  let versionId: string;

  async function createUser() {
    const user = await prisma.user.create({ data: { authSubject: `phase7-user-${randomUUID()}` } });
    userIds.push(user.id);
    await prisma.tasteProfile.create({ data: { userId: user.id, algorithmVersion: 'taste-v1' } });
    return user;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const ingredient = await prisma.ingredient.create({ data: { slug: `phase7-salt-${runId}`, canonicalName: 'Gia vị Phase 7' } });
    ingredientId = ingredient.id;
    const recipe = await prisma.recipe.create({ data: { slug, canonicalTitle: 'Món Phase 7', cuisine: 'vietnamese', status: 'published' } });
    recipeId = recipe.id;
    const version = await prisma.recipeVersion.create({ data: { recipeId, versionNo: 1, servings: 2, summary: 'Snapshot gốc', contentHash: runId, publishedAt: new Date() } });
    versionId = version.id;
    await prisma.recipeIngredient.create({ data: { recipeVersionId: version.id, ingredientId, quantity: 10, unit: 'ml', sortOrder: 1, scalingMode: 'CONSERVATIVE', scalingExponent: 0.75, roundingIncrement: null } });
    await prisma.recipeStep.create({ data: { recipeVersionId: version.id, stepNo: 1, instruction: 'Nấu đúng snapshot.', durationSeconds: 60 } });
    await prisma.recipeAdjustmentRule.create({
      data: { recipeVersionId: version.id, ingredientId, dimensionKey: 'saltiness', sensitivity: 0.5, minFactor: 0.75, maxFactor: 1.25 },
    });
  });

  afterAll(async () => {
    const profiles = await prisma.tasteProfile.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const profileIds = profiles.map(({ id }) => id);
    await prisma.tasteSignal.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.cookFeedback.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookEvent.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.personalizedRecipeVersion.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tasteDimension.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.tasteProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.recipe.delete({ where: { id: recipeId } });
    await prisma.ingredient.delete({ where: { id: ingredientId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('persists an immutable scaled snapshot and returns it after source rows change', async () => {
    const user = await createUser();
    const started = await cooking.start(user.id, { recipeSlug: slug, servings: 4 });
    expect(started.data.snapshot.ingredients[0]).toMatchObject({ canonicalQuantity: 10, scaledQuantity: 17, quantity: 17, roundingIncrement: null });
    const exactSnapshot = started.data.snapshot;

    await prisma.recipe.update({ where: { id: recipeId }, data: { canonicalTitle: 'Tên đã đổi' } });
    await prisma.recipeIngredient.updateMany({ where: { recipeVersionId: versionId }, data: { quantity: 999 } });
    await prisma.recipeStep.updateMany({ where: { recipeVersionId: versionId }, data: { instruction: 'Bước đã đổi' } });
    expect((await cooking.get(user.id, started.data.id)).data.snapshot).toEqual(exactSnapshot);
    await prisma.recipe.update({ where: { id: recipeId }, data: { canonicalTitle: 'Món Phase 7' } });
    await prisma.recipeIngredient.updateMany({ where: { recipeVersionId: versionId }, data: { quantity: 10 } });
    await prisma.recipeStep.updateMany({ where: { recipeVersionId: versionId }, data: { instruction: 'Nấu đúng snapshot.' } });
  });

  it('matches domain preview rounding for canonical and personalized snapshots with a null increment', async () => {
    const user = await createUser();
    const canonicalExpected = scaleIngredientQuantity({
      quantity: 10,
      unit: 'ml',
      scalingMode: 'CONSERVATIVE',
      scalingExponent: 0.75,
      roundingIncrement: null,
    }, 2, 4);
    const canonical = await cooking.start(user.id, { recipeSlug: slug, servings: 4 });
    expect(canonical.data.snapshot.ingredients[0].quantity).toBe(canonicalExpected.quantity);

    const profile = await prisma.tasteProfile.findUniqueOrThrow({
      where: { userId_algorithmVersion: { userId: user.id, algorithmVersion: 'taste-v1' } },
    });
    await prisma.tasteDimension.create({
      data: {
        tasteProfileId: profile.id,
        dimensionKey: 'saltiness',
        score: 0.5,
        confidence: 0.8,
        effectiveWeight: 2,
        sampleCount: 2,
      },
    });
    const personalized = await personalization.createVersion(user.id, slug);
    const personalizedIngredient = (personalized.data.snapshot as { ingredients: Array<{ personalizationFactor: number }> }).ingredients[0];
    const personalizedExpected = scaleIngredientQuantity({
      quantity: 10,
      unit: 'ml',
      scalingMode: 'CONSERVATIVE',
      scalingExponent: 0.75,
      roundingIncrement: null,
    }, 2, 4, personalizedIngredient.personalizationFactor);
    const personalizedSession = await cooking.start(user.id, {
      recipeSlug: slug,
      personalizedRecipeVersionId: personalized.data.id,
      servings: 4,
    });
    expect(personalizedSession.data.snapshot.ingredients[0]).toMatchObject({
      quantity: personalizedExpected.quantity,
      personalizationFactor: personalizedIngredient.personalizationFactor,
      roundingIncrement: null,
    });
  });

  it('keeps logical timer start and completion payloads idempotent across retries', async () => {
    const user = await createUser();
    const session = await cooking.start(user.id, { recipeSlug: slug });
    const startedAt = '2026-01-01T12:00:00.000Z';
    await cooking.addEvent(user.id, session.data.id, {
      eventType: 'timer_started', clientSeq: 1, clientTime: startedAt,
      payload: { stepNo: 1, durationSeconds: 600, startedAt },
    });
    const duplicateStart = await cooking.addEvent(user.id, session.data.id, {
      eventType: 'timer_started', clientSeq: 1, clientTime: '2026-01-01T12:05:00.000Z',
      payload: { stepNo: 1, durationSeconds: 600, startedAt: '2026-01-01T12:05:00.000Z' },
    });
    expect(duplicateStart.data.duplicate).toBe(true);
    expect((duplicateStart.data.payload as { startedAt: string }).startedAt).toBe(startedAt);

    await cooking.addEvent(user.id, session.data.id, {
      eventType: 'timer_completed', clientSeq: 2, clientTime: '2026-01-01T12:10:00.000Z', payload: { stepNo: 1 },
    });
    const duplicateCompletion = await cooking.addEvent(user.id, session.data.id, {
      eventType: 'timer_completed', clientSeq: 2, clientTime: '2026-01-01T12:10:01.000Z', payload: { stepNo: 1 },
    });
    expect(duplicateCompletion.data.duplicate).toBe(true);
    expect((await cooking.get(user.id, session.data.id)).data.events.map((event) => event.clientSeq)).toEqual([0, 1, 2]);
  });

  it('does not mint a personalized version for serving choice and hashes title changes in personalize-v2', async () => {
    await prisma.recipe.update({ where: { id: recipeId }, data: { canonicalTitle: 'Món Phase 7' } });
    await prisma.recipeIngredient.updateMany({ where: { recipeVersionId: versionId }, data: { quantity: 10 } });
    await prisma.recipeStep.updateMany({ where: { recipeVersionId: versionId }, data: { instruction: 'Nấu đúng snapshot.' } });
    const user = await createUser();
    const first = await personalization.createVersion(user.id, slug);
    const before = await prisma.personalizedRecipeVersion.count({ where: { userId: user.id } });
    await cooking.start(user.id, { recipeSlug: slug, personalizedRecipeVersionId: first.data.id, servings: 6 });
    expect(await prisma.personalizedRecipeVersion.count({ where: { userId: user.id } })).toBe(before);
    expect(first.data.algorithmVersion).toBe('personalize-v2');

    await prisma.recipe.update({ where: { id: recipeId }, data: { canonicalTitle: 'Món Phase 7 đổi tên' } });
    const renamed = await personalization.createVersion(user.id, slug);
    expect(renamed.data.id).not.toBe(first.data.id);
  });

  it('resumes only the current users latest active session and restores mixed events', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const older = await cooking.start(userA.id, { recipeSlug: slug });
    const latest = await cooking.start(userA.id, { recipeSlug: slug, servings: 3 });
    await cooking.addEvent(userA.id, latest.data.id, { eventType: 'timer_started', clientSeq: 4, clientTime: new Date().toISOString(), payload: { stepNo: 1, durationSeconds: 60 } });
    await cooking.addEvent(userA.id, latest.data.id, { eventType: 'step_completed', clientSeq: 2, clientTime: new Date().toISOString(), payload: { stepNo: 1 } });
    const resumed = await cooking.latestActive(userA.id);
    expect(resumed.data.id).toBe(latest.data.id);
    expect(resumed.data.id).not.toBe(older.data.id);
    expect(resumed.data.events.map((event) => event.clientSeq)).toEqual([0, 2, 4]);
    await expect(cooking.latestActive(userB.id)).rejects.toThrow();
  });

  it('provides a safe, non-persisting fallback for legacy null snapshots', async () => {
    const user = await createUser();
    const started = await cooking.start(user.id, { recipeSlug: slug });
    await prisma.cookSession.update({ where: { id: started.data.id }, data: { snapshotJson: Prisma.DbNull } });
    const legacy = await cooking.get(user.id, started.data.id);
    expect(legacy.data.snapshot.legacyFallback).toBe(true);
    expect((await prisma.cookSession.findUniqueOrThrow({ where: { id: started.data.id } })).snapshotJson).toBeNull();
  });
});

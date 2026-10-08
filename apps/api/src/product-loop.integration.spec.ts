import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { config } from 'dotenv';
import { CookSessionsService } from './cook-sessions/cook-sessions.service';
import { PrismaService } from './database/prisma.service';
import { FeedbackService } from './feedback/feedback.service';
import { PersonalizationService } from './personalization/personalization.service';
import { RecipesService } from './recipes/recipes.service';

config({ path: resolve(__dirname, '../../../.env') });

describe('core hardening invariants (database integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const slug = `hardening-recipe-${runId}`;
  const ingredientSlug = `hardening-seasoning-${runId}`;
  const prisma = new PrismaService();
  const recipes = new RecipesService(prisma);
  const cooking = new CookSessionsService(prisma);
  const feedback = new FeedbackService(prisma);
  const personalization = new PersonalizationService(prisma);
  const userIds: string[] = [];

  let recipeId: string;
  let ingredientId: string;

  async function createUser(withProfile = true) {
    const user = await prisma.user.create({
      data: { authSubject: `hardening-user-${runId}-${randomUUID()}` },
    });
    userIds.push(user.id);

    if (withProfile) {
      await prisma.tasteProfile.create({
        data: { userId: user.id, algorithmVersion: 'taste-v1' },
      });
    }

    return user;
  }

  async function completedSession(userId: string, personalizedRecipeVersionId?: string) {
    const session = await cooking.start(userId, {
      recipeSlug: slug,
      personalizedRecipeVersionId,
    });
    await cooking.complete(userId, session.data.id);
    return session;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const ingredient = await prisma.ingredient.create({
      data: {
        slug: ingredientSlug,
        canonicalName: 'Gia vị kiểm thử hardening',
        category: 'seasoning',
      },
    });
    ingredientId = ingredient.id;

    const recipe = await prisma.recipe.create({
      data: {
        slug,
        canonicalTitle: 'Món kiểm thử hardening',
        status: 'published',
      },
    });
    recipeId = recipe.id;

    const version = await prisma.recipeVersion.create({
      data: {
        recipeId,
        versionNo: 1,
        servings: 2,
        prepTimeMinutes: 5,
        cookTimeMinutes: 10,
        summary: 'Fixture tích hợp cô lập.',
        contentHash: randomUUID().replace(/-/g, ''),
        publishedAt: new Date(),
      },
    });
    await prisma.recipeIngredient.create({
      data: {
        recipeVersionId: version.id,
        ingredientId,
        quantity: 10,
        unit: 'g',
        sortOrder: 1,
      },
    });
    await prisma.recipeStep.create({
      data: {
        recipeVersionId: version.id,
        stepNo: 1,
        instruction: 'Nấu fixture đến khi hoàn thành.',
        durationSeconds: 60,
      },
    });
    await prisma.recipeAdjustmentRule.create({
      data: {
        recipeVersionId: version.id,
        ingredientId,
        dimensionKey: 'saltiness',
        sensitivity: 0.5,
        minFactor: 0.75,
        maxFactor: 1.25,
      },
    });
  });

  afterAll(async () => {
    const profiles = await prisma.tasteProfile.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const profileIds = profiles.map(({ id }) => id);
    await prisma.tasteSignal.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.cookFeedback.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookEvent.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.personalizedRecipeVersion.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tasteDimension.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.tasteProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.recipe.deleteMany({ where: { id: recipeId } });
    await prisma.ingredient.deleteMany({ where: { id: ingredientId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('reads recipes and completes one session transition under concurrency', async () => {
    const user = await createUser();
    const list = await recipes.list(100);
    expect(list.data.some((item) => item.slug === slug)).toBe(true);
    expect((await recipes.detail(slug)).data.version.ingredients).toHaveLength(1);

    const session = await cooking.start(user.id, { recipeSlug: slug });
    const completed = await Promise.all([
      cooking.complete(user.id, session.data.id),
      cooking.complete(user.id, session.data.id),
    ]);
    expect(completed.every((result) => result.data.status === 'completed')).toBe(true);
    expect(completed.every((result) => result.data.syncVersion === 2)).toBe(true);
    const stored = await prisma.cookSession.findUniqueOrThrow({ where: { id: session.data.id } });
    expect(stored.syncVersion).toBe(2);
    expect(Number(stored.servings)).toBe(2);
  });

  it('creates one taste-v1 profile during concurrent application attempts', async () => {
    const user = await createUser(false);
    const [first, second] = await Promise.all([
      completedSession(user.id),
      completedSession(user.id),
    ]);

    await Promise.all([
      feedback.submit(user.id, first.data.id, {
        dimensions: { saltiness: 0.5 },
        technicalFlags: ['burnt'],
      }),
      feedback.submit(user.id, second.data.id, {
        dimensions: { saltiness: -0.5 },
        technicalFlags: ['undercooked'],
      }),
    ]);

    const profiles = await prisma.tasteProfile.findMany({
      where: { userId: user.id, algorithmVersion: 'taste-v1' },
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].sampleCount).toBe(0);
  });

  it('applies concurrent duplicate feedback learning exactly once', async () => {
    const user = await createUser();
    const session = await completedSession(user.id);
    const input = { dimensions: { saltiness: -0.5 }, overallScore: 4.5 };
    const outcomes = await Promise.allSettled([
      feedback.submit(user.id, session.data.id, input),
      feedback.submit(user.id, session.data.id, input),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(({ status }) => status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: expect.any(ConflictException) });

    const profile = await prisma.tasteProfile.findUniqueOrThrow({
      where: { userId_algorithmVersion: { userId: user.id, algorithmVersion: 'taste-v1' } },
      include: { dimensions: true, signals: true },
    });
    expect(profile.sampleCount).toBe(1);
    expect(profile.dimensions).toHaveLength(1);
    expect(profile.dimensions[0].sampleCount).toBe(1);
    expect(profile.signals).toHaveLength(1);
    expect(await prisma.cookFeedback.count({ where: { cookSessionId: session.data.id } })).toBe(1);
  });

  it('learns explicit zero without manufacturing omitted dimensions', async () => {
    const user = await createUser();
    const session = await completedSession(user.id);
    const result = await feedback.submit(user.id, session.data.id, {
      dimensions: { saltiness: 0 },
    });
    const storedFeedback = await prisma.cookFeedback.findUniqueOrThrow({
      where: { cookSessionId: session.data.id },
    });
    expect(storedFeedback.dimensionJson).toEqual({ saltiness: 0 });

    const signals = await prisma.tasteSignal.findMany({
      where: { cookFeedbackId: result.data.feedback.id },
    });
    expect(signals).toHaveLength(1);
    expect(signals[0].dimensionKey).toBe('saltiness');
    expect(Number(signals[0].signalValue)).toBe(0);
  });

  it('audits every technical failure reason without changing learned state', async () => {
    const user = await createUser();
    const profile = await prisma.tasteProfile.findUniqueOrThrow({
      where: { userId_algorithmVersion: { userId: user.id, algorithmVersion: 'taste-v1' } },
    });
    await prisma.tasteDimension.create({
      data: {
        tasteProfileId: profile.id,
        dimensionKey: 'saltiness',
        score: 0.3,
        confidence: 0.6,
        effectiveWeight: 3,
        sampleCount: 3,
      },
    });
    await prisma.tasteProfile.update({
      where: { id: profile.id },
      data: { sampleCount: 3, maturityScore: 0.3 },
    });
    const before = await prisma.tasteDimension.findFirstOrThrow({
      where: { tasteProfileId: profile.id, dimensionKey: 'saltiness' },
    });

    const session = await completedSession(user.id);
    const result = await feedback.submit(user.id, session.data.id, {
      dimensions: { saltiness: 1 },
      technicalFlags: ['undercooked', 'burnt'],
    });
    const afterProfile = await prisma.tasteProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const after = await prisma.tasteDimension.findFirstOrThrow({
      where: { tasteProfileId: profile.id, dimensionKey: 'saltiness' },
    });
    expect(afterProfile.sampleCount).toBe(3);
    expect(after).toMatchObject({
      score: before.score,
      confidence: before.confidence,
      effectiveWeight: before.effectiveWeight,
      sampleCount: before.sampleCount,
    });
    const excluded = await prisma.tasteSignal.findFirstOrThrow({
      where: { cookFeedbackId: result.data.feedback.id },
    });
    expect(Number(excluded.qualityFactor)).toBe(0);
    expect(JSON.parse(excluded.excludedReason ?? '[]')).toEqual(['burnt', 'undercooked']);
  });

  it('serializes a user-recipe version stream and hashes only effective content', async () => {
    const user = await createUser();
    const profile = await prisma.tasteProfile.findUniqueOrThrow({
      where: { userId_algorithmVersion: { userId: user.id, algorithmVersion: 'taste-v1' } },
    });
    await prisma.tasteDimension.create({
      data: {
        tasteProfileId: profile.id,
        dimensionKey: 'saltiness',
        score: -0.5,
        confidence: 0.6,
        effectiveWeight: 3,
        sampleCount: 3,
      },
    });

    const generated = await Promise.all([
      personalization.createVersion(user.id, slug),
      personalization.createVersion(user.id, slug),
    ]);
    expect(generated[0].data.id).toBe(generated[1].data.id);
    expect(await prisma.personalizedRecipeVersion.count({
      where: { userId: user.id, recipeId },
    })).toBe(1);
    const personalV2 = generated[0].data;
    expect(personalV2.versionNo).toBe(2);

    await prisma.tasteDimension.create({
      data: {
        tasteProfileId: profile.id,
        dimensionKey: 'sweetness',
        score: 0.9,
        confidence: 0.9,
        effectiveWeight: 4,
        sampleCount: 4,
      },
    });
    await prisma.tasteProfile.update({
      where: { id: profile.id },
      data: { sampleCount: { increment: 1 }, maturityScore: 0.4 },
    });
    const irrelevantTasteChange = await personalization.createVersion(user.id, slug);
    expect(irrelevantTasteChange.data.id).toBe(personalV2.id);
    expect(irrelevantTasteChange.data.reused).toBe(true);

    await prisma.tasteDimension.update({
      where: {
        tasteProfileId_dimensionKey_scopeType_scopeId: {
          tasteProfileId: profile.id,
          dimensionKey: 'saltiness',
          scopeType: 'global',
          scopeId: '',
        },
      },
      data: { score: -0.9, confidence: 0.9 },
    });
    const personalV3 = await personalization.createVersion(user.id, slug);
    expect(personalV3.data.id).not.toBe(personalV2.id);
    expect(personalV3.data.versionNo).toBe(3);

    const v2Row = await prisma.personalizedRecipeVersion.findUniqueOrThrow({
      where: { id: personalV2.id },
    });
    const v2Snapshot = v2Row.snapshotJson as Prisma.JsonObject;
    await prisma.personalizedRecipeVersion.update({
      where: { id: personalV2.id },
      data: { snapshotJson: { ...v2Snapshot, servings: 3 } as Prisma.InputJsonValue },
    });
    const historicalSession = await cooking.start(user.id, {
      recipeSlug: slug,
      personalizedRecipeVersionId: personalV2.id,
    });
    expect(historicalSession.data.servings).toBe(3);
    expect(historicalSession.data.recipe.personalizedVersionId).toBe(personalV2.id);
    await cooking.complete(user.id, historicalSession.data.id);
    const learned = await feedback.submit(user.id, historicalSession.data.id, {
      dimensions: { saltiness: 0 },
    });

    const provenance = await prisma.tasteSignal.findFirstOrThrow({
      where: { cookFeedbackId: learned.data.feedback.id },
      include: {
        cookFeedback: {
          include: { cookSession: true },
        },
      },
    });
    expect(provenance.cookFeedback?.cookSession.id).toBe(historicalSession.data.id);
    expect(provenance.cookFeedback?.cookSession.personalizedRecipeVersionId).toBe(personalV2.id);
    const historical = await cooking.get(user.id, historicalSession.data.id);
    expect(historical.data.recipe.personalizedVersionId).toBe(personalV2.id);
    expect(historical.data.recipe.personalizedVersionNo).toBe(2);
  });
});

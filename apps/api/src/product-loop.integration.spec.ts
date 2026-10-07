import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ConflictException } from '@nestjs/common';
import { config } from 'dotenv';
import { PrismaService } from './database/prisma.service';
import { CookSessionsService } from './cook-sessions/cook-sessions.service';
import { FeedbackService } from './feedback/feedback.service';
import { PersonalizationService } from './personalization/personalization.service';
import { RecipesService } from './recipes/recipes.service';

config({ path: resolve(__dirname, '../../../.env') });

describe('critical product loop (database integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const slug = `integration-recipe-${runId}`;
  const ingredientSlug = `integration-seasoning-${runId}`;
  const prisma = new PrismaService();
  const recipes = new RecipesService(prisma);
  const cooking = new CookSessionsService(prisma);
  const feedback = new FeedbackService(prisma);
  const personalization = new PersonalizationService(prisma);

  let userId: string;
  let recipeId: string;
  let ingredientId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const user = await prisma.user.create({
      data: { authSubject: `integration-user-${runId}` },
    });
    userId = user.id;

    await prisma.tasteProfile.create({
      data: { userId, algorithmVersion: 'taste-v1' },
    });

    const ingredient = await prisma.ingredient.create({
      data: {
        slug: ingredientSlug,
        canonicalName: 'Gia vị kiểm thử',
        category: 'seasoning',
      },
    });
    ingredientId = ingredient.id;

    const recipe = await prisma.recipe.create({
      data: {
        slug,
        canonicalTitle: 'Món kiểm thử vòng lặp',
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
    if (userId) {
      await prisma.cookFeedback.deleteMany({ where: { cookSession: { userId } } });
      await prisma.cookEvent.deleteMany({ where: { cookSession: { userId } } });
      await prisma.cookSession.deleteMany({ where: { userId } });
      await prisma.personalizedRecipeVersion.deleteMany({ where: { userId } });
      const profiles = await prisma.tasteProfile.findMany({ where: { userId }, select: { id: true } });
      const profileIds = profiles.map(({ id }) => id);
      await prisma.tasteSignal.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
      await prisma.tasteDimension.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
      await prisma.tasteProfile.deleteMany({ where: { userId } });
    }
    if (recipeId) await prisma.recipe.deleteMany({ where: { id: recipeId } });
    if (ingredientId) await prisma.ingredient.deleteMany({ where: { id: ingredientId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('keeps canonical, learning, personalization, and historical-version invariants', async () => {
    const list = await recipes.list(100);
    expect(list.data.some((item) => item.slug === slug)).toBe(true);
    const detail = await recipes.detail(slug);
    expect(detail.data.version.ingredients).toHaveLength(1);

    const canonical = await cooking.start({ userId, recipeSlug: slug });
    expect(canonical.data.recipe.source).toBe('canonical');
    expect(canonical.data.recipe.personalizedVersionId).toBeNull();

    const eventInput = {
      eventType: 'step_completed',
      clientSeq: 1,
      clientTime: new Date().toISOString(),
      payload: { stepNo: 1 },
    };
    const firstEvent = await cooking.addEvent(canonical.data.id, eventInput);
    const duplicateEvent = await cooking.addEvent(canonical.data.id, eventInput);
    expect(duplicateEvent.data.id).toBe(firstEvent.data.id);
    expect(duplicateEvent.data.duplicate).toBe(true);

    await expect(feedback.submit(canonical.data.id, {
      overallScore: 4,
      dimensions: { saltiness: -0.5 },
    })).rejects.toBeInstanceOf(ConflictException);

    await cooking.complete(canonical.data.id);
    const accepted = await feedback.submit(canonical.data.id, {
      overallScore: 4.5,
      dimensions: { saltiness: -0.5 },
      technicalFlags: [],
    });
    expect(accepted.data.tasteProfile.sampleCount).toBe(1);
    expect(accepted.data.tasteProfile.dimensions[0]).toMatchObject({
      key: 'saltiness', score: -0.5, confidence: 0.2,
    });

    const personalV2 = await personalization.createVersion(userId, slug);
    expect(personalV2.data.reused).toBe(false);
    expect(personalV2.data.versionNo).toBe(2);
    const sameTasteDna = await personalization.createVersion(userId, slug);
    expect(sameTasteDna.data.id).toBe(personalV2.data.id);
    expect(sameTasteDna.data.reused).toBe(true);

    const personalizedSession = await cooking.start({
      userId,
      recipeSlug: slug,
      personalizedRecipeVersionId: personalV2.data.id,
    });
    expect(personalizedSession.data.recipe).toMatchObject({
      source: 'personalized',
      personalizedVersionId: personalV2.data.id,
      personalizedVersionNo: 2,
    });

    await cooking.complete(personalizedSession.data.id);
    const secondFeedback = await feedback.submit(personalizedSession.data.id, {
      overallScore: 5,
      dimensions: { saltiness: -1 },
    });
    expect(secondFeedback.data.tasteProfile.sampleCount).toBe(2);

    const personalV3 = await personalization.createVersion(userId, slug);
    expect(personalV3.data.reused).toBe(false);
    expect(personalV3.data.versionNo).toBe(3);
    expect(personalV3.data.id).not.toBe(personalV2.data.id);

    const historical = await cooking.get(personalizedSession.data.id);
    expect(historical.data.recipe.personalizedVersionId).toBe(personalV2.data.id);
    expect(historical.data.recipe.personalizedVersionNo).toBe(2);
    await expect(feedback.submit(personalizedSession.data.id, {
      dimensions: { saltiness: 0 },
    })).rejects.toBeInstanceOf(ConflictException);

    const faultyCook = await cooking.start({ userId, recipeSlug: slug });
    await cooking.complete(faultyCook.data.id);
    const excluded = await feedback.submit(faultyCook.data.id, {
      dimensions: { saltiness: 1 },
      technicalFlags: ['burnt'],
    });
    expect(excluded.data.tasteProfile.sampleCount).toBe(2);
    const excludedSignal = await prisma.tasteSignal.findFirst({
      where: { tasteProfileId: excluded.data.tasteProfile.id, excludedReason: 'burnt' },
      orderBy: { createdAt: 'desc' },
    });
    expect(excludedSignal).toMatchObject({ excludedReason: 'burnt' });
    expect(Number(excludedSignal?.qualityFactor)).toBe(0);
  });
});

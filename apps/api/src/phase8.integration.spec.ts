import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { replayTasteSignals } from '@bep-nho/domain';
import { config } from 'dotenv';
import { CookSessionsService } from './cook-sessions/cook-sessions.service';
import { PrismaService } from './database/prisma.service';
import { FeedbackService } from './feedback/feedback.service';
import { PersonalizationService } from './personalization/personalization.service';

config({ path: resolve(__dirname, '../../../.env') });

describe('Phase 8 learning controls and version decisions (database integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const slug = `phase8-recipe-${runId}`;
  const ingredientSlug = `phase8-seasoning-${runId}`;
  const secondIngredientSlug = `phase8-seasoning-b-${runId}`;
  const prisma = new PrismaService();
  const feedback = new FeedbackService(prisma);
  const personalization = new PersonalizationService(prisma);
  const cooking = new CookSessionsService(prisma);
  const userIds: string[] = [];
  let recipeId: string;
  let versionId: string;
  let ingredientId: string;
  let secondIngredientId: string;

  async function createUser() {
    const user = await prisma.user.create({
      data: { authSubject: `phase8-user-${runId}-${randomUUID()}` },
    });
    userIds.push(user.id);
    const profile = await prisma.tasteProfile.create({
      data: { userId: user.id, algorithmVersion: 'taste-v1' },
    });
    return { user, profile };
  }

  async function submitFeedback(
    userId: string,
    dimensions: Record<string, number>,
    options: { technicalFlags?: string[]; privateNote?: string } = {},
  ) {
    const session = await cooking.start(userId, { recipeSlug: slug });
    await cooking.complete(userId, session.data.id);
    return feedback.submit(userId, session.data.id, {
      dimensions,
      technicalFlags: options.technicalFlags,
      privateNote: options.privateNote,
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    const ingredient = await prisma.ingredient.create({
      data: { slug: ingredientSlug, canonicalName: 'Gia vị Phase 8', category: 'seasoning' },
    });
    ingredientId = ingredient.id;
    const secondIngredient = await prisma.ingredient.create({
      data: { slug: secondIngredientSlug, canonicalName: 'Gia vị B Phase 8', category: 'seasoning' },
    });
    secondIngredientId = secondIngredient.id;
    const recipe = await prisma.recipe.create({
      data: { slug, canonicalTitle: 'Món Phase 8', status: 'published' },
    });
    recipeId = recipe.id;
    const version = await prisma.recipeVersion.create({
      data: {
        recipeId,
        versionNo: 1,
        servings: 2,
        summary: 'Kiểm thử quyền kiểm soát học.',
        contentHash: runId,
        publishedAt: new Date(),
      },
    });
    versionId = version.id;
    await prisma.recipeIngredient.create({
      data: {
        recipeVersionId: version.id,
        ingredientId,
        quantity: 10,
        unit: 'g',
        sortOrder: 1,
      },
    });
    await prisma.recipeIngredient.create({
      data: {
        recipeVersionId: version.id,
        ingredientId: secondIngredientId,
        quantity: 20,
        unit: 'ml',
        sortOrder: 2,
      },
    });
    await prisma.recipeStep.create({
      data: { recipeVersionId: version.id, stepNo: 1, instruction: 'Nấu đúng snapshot.' },
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
    await prisma.recipeAdjustmentRule.create({
      data: {
        recipeVersionId: version.id,
        ingredientId: secondIngredientId,
        dimensionKey: 'sweetness',
        sensitivity: 0.5,
        minFactor: 0.75,
        maxFactor: 1.25,
      },
    });
  });

  afterAll(async () => {
    const profiles = await prisma.tasteProfile.findMany({
      where: { userId: { in: userIds } }, select: { id: true },
    });
    const profileIds = profiles.map(({ id }) => id);
    await prisma.userRecipePreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.personalizedAdjustmentDecision.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tasteControlEvent.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.tasteSignal.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.cookFeedback.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookEvent.deleteMany({ where: { cookSession: { userId: { in: userIds } } } });
    await prisma.cookSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.personalizedRecipeVersion.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tasteDimension.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.tasteProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.recipe.delete({ where: { id: recipeId } });
    await prisma.ingredient.deleteMany({ where: { id: { in: [ingredientId, secondIngredientId] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('applies zero-confidence manual overrides including explicit zero and audits clear', async () => {
    const { user } = await createUser();
    const zero = await feedback.updateOverride(user.id, 'saltiness', 0);
    expect(zero.data.dimensions.find(({ key }) => key === 'saltiness')).toMatchObject({
      score: 0,
      confidence: 0,
      manualOverride: 0,
      effectiveScore: 0,
      effectiveConfidence: 1,
    });

    await feedback.updateOverride(user.id, 'saltiness', 1);
    const generated = await personalization.createVersion(user.id, slug);
    const snapshot = generated.data.snapshot as unknown as { ingredients: Array<{ quantity: number }> };
    expect(generated.data.algorithmVersion).toBe('personalize-v3');
    expect(generated.data.originType).toBe('taste_engine');
    expect(snapshot.ingredients[0].quantity).toBe(12.5);

    await feedback.updateOverride(user.id, 'saltiness', null);
    const manual = await feedback.updateOverride(user.id, 'saltiness', -0.5);
    expect(manual.data.dimensions.find(({ key }) => key === 'saltiness')).toMatchObject({
      manualOverride: -0.5,
      effectiveScore: -0.5,
      effectiveConfidence: 1,
    });
    const personalizedSession = await cooking.start(user.id, {
      recipeSlug: slug,
      personalizedRecipeVersionId: generated.data.id,
    });
    await cooking.complete(user.id, personalizedSession.data.id);
    await feedback.submit(user.id, personalizedSession.data.id, {
      dimensions: { saltiness: 1 },
      privateNote: 'Exact personalized provenance',
    });
    const learnedBeneath = await feedback.getTasteProfile(user.id);
    expect(learnedBeneath.data.dimensions.find(({ key }) => key === 'saltiness')).toMatchObject({
      score: 1,
      confidence: 0.2,
      manualOverride: -0.5,
      effectiveScore: -0.5,
    });
    const exactHistory = await feedback.history(user.id, { limit: 10, dimension: 'saltiness' });
    expect(exactHistory.data.some((event) => event.kind === 'signal'
      && event.signal.canonicalRecipeVersionId === versionId
      && event.signal.personalizedRecipeVersionId === generated.data.id
      && event.signal.personalizedRecipeVersionNo === generated.data.versionNo)).toBe(true);

    const cleared = await feedback.updateOverride(user.id, 'saltiness', null);
    expect(cleared.data.dimensions.find(({ key }) => key === 'saltiness')).toMatchObject({
      manualOverride: null,
      score: 1,
      effectiveScore: 1,
      effectiveConfidence: 0.2,
    });
    expect(await prisma.tasteControlEvent.findMany({
      where: { tasteProfile: { userId: user.id }, dimensionKey: 'saltiness' },
      orderBy: { createdAt: 'asc' },
    })).toHaveLength(5);
  });

  it('resets one dimension without deleting evidence and deterministically replays later valid signals', async () => {
    const { user, profile } = await createUser();
    await submitFeedback(user.id, { saltiness: 0.8, sweetness: 0.4 }, { privateNote: 'Ghi chú riêng Phase 8' });
    await feedback.updateOverride(user.id, 'saltiness', -0.2);
    const beforeProfile = await prisma.tasteProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const beforeSignals = await prisma.tasteSignal.count({ where: { tasteProfileId: profile.id } });

    const reset = await feedback.resetDimension(user.id, 'saltiness');
    expect(reset.data.sampleCount).toBe(beforeProfile.sampleCount);
    expect(reset.data.dimensions.find(({ key }) => key === 'saltiness')).toMatchObject({
      score: 0, confidence: 0, effectiveWeight: 0, sampleCount: 0, manualOverride: null,
    });
    expect(reset.data.dimensions.find(({ key }) => key === 'sweetness')).toMatchObject({
      score: 0.4, sampleCount: 1,
    });
    expect(await prisma.tasteSignal.count({ where: { tasteProfileId: profile.id } })).toBe(beforeSignals);

    await submitFeedback(user.id, { saltiness: -1 }, { privateNote: 'Sau reset' });
    await submitFeedback(user.id, { saltiness: 1 }, { technicalFlags: ['burnt'], privateNote: 'Bị cháy' });
    const replayed = await feedback.getTasteProfile(user.id);
    expect(replayed.data.dimensions.find(({ key }) => key === 'saltiness')).toMatchObject({
      score: -1, confidence: 0.2, effectiveWeight: 1, sampleCount: 1,
    });
    expect(replayed.data.sampleCount).toBe(beforeProfile.sampleCount + 1);

    const page = await feedback.history(user.id, { limit: 2 });
    expect(page.data).toHaveLength(2);
    expect(page.meta.nextCursor).toEqual(expect.any(String));
    const next = await feedback.history(user.id, { limit: 2, cursor: page.meta.nextCursor ?? undefined });
    expect(next.data.every((event) => !page.data.some((first) => first.id === event.id))).toBe(true);
    const full = await feedback.history(user.id, { limit: 100, dimension: 'saltiness' });
    expect(full.data.some((event) => event.kind === 'control' && event.control?.action === 'learning_reset')).toBe(true);
    expect(full.data.some((event) => event.kind === 'signal'
      && event.signal.privateNote === 'Ghi chú riêng Phase 8')).toBe(true);
    expect(full.data.some((event) => event.kind === 'signal'
      && event.signal.qualityFactor === 0 && event.signal.excludedReason)).toBe(true);

    const concurrentSession = await cooking.start(user.id, { recipeSlug: slug });
    await cooking.complete(user.id, concurrentSession.data.id);
    await Promise.all([
      feedback.submit(user.id, concurrentSession.data.id, { dimensions: { sweetness: -1 } }),
      feedback.resetDimension(user.id, 'sweetness'),
    ]);
    const latestReset = await prisma.tasteControlEvent.findFirstOrThrow({
      where: { tasteProfileId: profile.id, dimensionKey: 'sweetness', action: 'learning_reset' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const postResetSignals = await prisma.tasteSignal.findMany({
      where: {
        tasteProfileId: profile.id,
        dimensionKey: 'sweetness',
        createdAt: { gt: latestReset.createdAt },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const deterministic = replayTasteSignals(postResetSignals.map((signal) => ({
      signalValue: Number(signal.signalValue),
      baseWeight: Number(signal.baseWeight),
      qualityFactor: Number(signal.qualityFactor),
      excludedReason: signal.excludedReason,
    })));
    const stored = (await feedback.getTasteProfile(user.id)).data.dimensions
      .find(({ key }) => key === 'sweetness');
    expect(stored).toMatchObject(deterministic);
  });

  it('records append-only decisions, reuses effective content, preserves provenance, and pins an exact best version', async () => {
    const { user, profile } = await createUser();
    const foreign = await createUser();
    await prisma.tasteDimension.create({
      data: {
        tasteProfileId: profile.id,
        dimensionKey: 'saltiness',
        score: 1,
        confidence: 1,
        effectiveWeight: 5,
        sampleCount: 5,
      },
    });
    const source = await personalization.createVersion(user.id, slug);
    const sourceBefore = await prisma.personalizedRecipeVersion.findUniqueOrThrow({ where: { id: source.data.id } });

    const accepted = await personalization.decide(user.id, slug, source.data.id, ingredientSlug, 'ACCEPT');
    expect(accepted.data.resultVersion).toBeNull();
    expect(await prisma.personalizedRecipeVersion.count({ where: { userId: user.id, recipeId } })).toBe(1);

    const rejected = await personalization.decide(user.id, slug, source.data.id, ingredientSlug, 'REJECT');
    expect(rejected.data.resultVersion).toMatchObject({
      originType: 'user_edit',
      parentPersonalizedRecipeVersionId: source.data.id,
    });
    const rejectedSnapshot = rejected.data.resultVersion?.snapshot as unknown as {
      servings: number; ingredients: Array<{ quantity: number; personalizationFactor: number }>;
    };
    expect(rejectedSnapshot).toMatchObject({ servings: 2 });
    expect(rejectedSnapshot.ingredients[0]).toMatchObject({ quantity: 10, personalizationFactor: 1 });

    const rejectedAgain = await personalization.decide(user.id, slug, source.data.id, ingredientSlug, 'REJECT');
    expect(rejectedAgain.data.resultVersion?.id).toBe(rejected.data.resultVersion?.id);
    expect(await prisma.personalizedAdjustmentDecision.count({
      where: { sourcePersonalizedRecipeVersionId: source.data.id },
    })).toBe(3);

    const edited = await personalization.decide(user.id, slug, source.data.id, ingredientSlug, 'EDIT', 11);
    const editedSnapshot = edited.data.resultVersion?.snapshot as unknown as {
      servings: number; ingredients: Array<{ quantity: number }>;
    };
    expect(editedSnapshot.servings).toBe(2);
    expect(editedSnapshot.ingredients[0].quantity).toBe(11);
    const countBeforeInvalid = await prisma.personalizedRecipeVersion.count({ where: { userId: user.id } });
    await expect(personalization.decide(user.id, slug, source.data.id, ingredientSlug, 'EDIT', 20))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.personalizedRecipeVersion.count({ where: { userId: user.id } })).toBe(countBeforeInvalid);

    const concurrent = await Promise.all([
      personalization.decide(user.id, slug, source.data.id, ingredientSlug, 'EDIT', 11.5),
      personalization.decide(user.id, slug, source.data.id, ingredientSlug, 'EDIT', 11.5),
    ]);
    expect(concurrent[0].data.resultVersion?.id).toBe(concurrent[1].data.resultVersion?.id);
    const versionNos = (await prisma.personalizedRecipeVersion.findMany({
      where: { userId: user.id, recipeId }, orderBy: { versionNo: 'asc' }, select: { versionNo: true },
    })).map(({ versionNo }) => versionNo);
    expect(new Set(versionNos).size).toBe(versionNos.length);

    const sourceAfter = await prisma.personalizedRecipeVersion.findUniqueOrThrow({ where: { id: source.data.id } });
    expect(sourceAfter.snapshotJson).toEqual(sourceBefore.snapshotJson);
    await personalization.pinBest(user.id, slug, rejected.data.resultVersion!.id);
    expect((await personalization.overview(user.id, slug)).data.bestVersion?.id)
      .toBe(rejected.data.resultVersion?.id);
    await personalization.pinBest(user.id, slug, edited.data.resultVersion!.id);
    expect((await personalization.overview(user.id, slug)).data.bestVersion?.id)
      .toBe(edited.data.resultVersion?.id);
    await personalization.pinBest(user.id, slug, rejected.data.resultVersion!.id);
    await expect(personalization.pinBest(foreign.user.id, slug, rejected.data.resultVersion!.id))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(personalization.pinBest(user.id, 'wrong-recipe-slug', rejected.data.resultVersion!.id))
      .rejects.toBeInstanceOf(NotFoundException);

    await prisma.tasteDimension.update({
      where: {
        tasteProfileId_dimensionKey_scopeType_scopeId: {
          tasteProfileId: profile.id, dimensionKey: 'saltiness', scopeType: 'global', scopeId: '',
        },
      },
      data: { score: -1 },
    });
    const newSuggestion = await personalization.createVersion(user.id, slug);
    const overview = await personalization.overview(user.id, slug);
    expect(overview.data.latestEngine?.id).toBe(newSuggestion.data.id);
    expect(overview.data.latestAny?.id).toBe(newSuggestion.data.id);
    expect(overview.data.bestVersion?.id).toBe(rejected.data.resultVersion?.id);

    const cooked = await cooking.start(user.id, {
      recipeSlug: slug,
      personalizedRecipeVersionId: overview.data.bestVersion!.id,
      servings: 4,
    });
    expect(cooked.data.snapshot.personalizedVersion?.id).toBe(overview.data.bestVersion?.id);
    expect(cooked.data.snapshot.servings).toBe(4);
    expect(cooked.data.snapshot.ingredients[0].quantity).toBe(20);
    await personalization.unpinBest(user.id, slug);
    expect((await personalization.overview(user.id, slug)).data.bestVersion).toBeNull();
  });

  it('composes chained decisions on the immediate active source without losing prior edits', async () => {
    const { user, profile } = await createUser();
    await prisma.tasteDimension.createMany({
      data: [
        {
          tasteProfileId: profile.id, dimensionKey: 'saltiness', score: 1,
          confidence: 1, effectiveWeight: 5, sampleCount: 5,
        },
        {
          tasteProfileId: profile.id, dimensionKey: 'sweetness', score: 1,
          confidence: 1, effectiveWeight: 5, sampleCount: 5,
        },
      ],
    });
    const engineVersion = await personalization.createVersion(user.id, slug);
    const engineSnapshot = structuredClone(engineVersion.data.snapshot) as unknown as {
      ingredients: Array<{ slug: string; quantity: number }>;
      adjustments: Array<{ ingredientSlug: string; reviewStatus?: string }>;
    };
    expect(engineSnapshot.ingredients.find(({ slug: value }) => value === ingredientSlug)?.quantity).toBe(12.5);
    expect(engineSnapshot.ingredients.find(({ slug: value }) => value === secondIngredientSlug)?.quantity).toBe(25);

    const editA = await personalization.decide(
      user.id, slug, engineVersion.data.id, ingredientSlug, 'EDIT', 11,
    );
    const v5 = editA.data.resultVersion!;
    const v5Snapshot = structuredClone(v5.snapshot) as unknown as {
      ingredients: Array<{ slug: string; quantity: number }>;
      adjustments: Array<{ ingredientSlug: string; reviewStatus?: string }>;
    };
    expect(v5.parentPersonalizedRecipeVersionId).toBe(engineVersion.data.id);
    expect(v5Snapshot.ingredients.find(({ slug: value }) => value === ingredientSlug)?.quantity).toBe(11);
    expect(v5Snapshot.ingredients.find(({ slug: value }) => value === secondIngredientSlug)?.quantity).toBe(25);
    expect(v5Snapshot.adjustments.find(({ ingredientSlug: value }) => value === ingredientSlug))
      .toMatchObject({ reviewStatus: 'edited' });
    expect(v5Snapshot.adjustments.find(({ ingredientSlug: value }) => value === secondIngredientSlug))
      .toMatchObject({ reviewStatus: 'pending' });

    const rejectB = await personalization.decide(
      user.id, slug, v5.id, secondIngredientSlug, 'REJECT',
    );
    const v6 = rejectB.data.resultVersion!;
    const v6Snapshot = v6.snapshot as unknown as {
      ingredients: Array<{ slug: string; quantity: number }>;
      adjustments: Array<{ ingredientSlug: string; reviewStatus?: string }>;
    };
    expect(v6.parentPersonalizedRecipeVersionId).toBe(v5.id);
    expect(v6Snapshot.ingredients.find(({ slug: value }) => value === ingredientSlug)?.quantity).toBe(11);
    expect(v6Snapshot.ingredients.find(({ slug: value }) => value === secondIngredientSlug)?.quantity).toBe(20);
    expect(v6Snapshot.adjustments).toEqual([
      expect.objectContaining({ ingredientSlug, reviewStatus: 'edited' }),
    ]);

    const storedEngine = await prisma.personalizedRecipeVersion.findUniqueOrThrow({
      where: { id: engineVersion.data.id },
    });
    const storedV5 = await prisma.personalizedRecipeVersion.findUniqueOrThrow({ where: { id: v5.id } });
    expect(storedEngine.snapshotJson).toEqual(engineVersion.data.snapshot);
    expect(storedV5.snapshotJson).toEqual(v5.snapshot);

    const decisions = await prisma.personalizedAdjustmentDecision.findMany({
      where: { userId: user.id }, orderBy: { createdAt: 'asc' },
    });
    expect(decisions).toEqual([
      expect.objectContaining({
        action: 'EDIT',
        sourcePersonalizedRecipeVersionId: engineVersion.data.id,
        resultPersonalizedRecipeVersionId: v5.id,
      }),
      expect.objectContaining({
        action: 'REJECT',
        sourcePersonalizedRecipeVersionId: v5.id,
        resultPersonalizedRecipeVersionId: v6.id,
      }),
    ]);

    const countBeforeReuse = await prisma.personalizedRecipeVersion.count({
      where: { userId: user.id, recipeId },
    });
    const reused = await personalization.decide(
      user.id, slug, v5.id, secondIngredientSlug, 'REJECT',
    );
    expect(reused.data.resultVersion?.id).toBe(v6.id);
    expect(await prisma.personalizedRecipeVersion.count({
      where: { userId: user.id, recipeId },
    })).toBe(countBeforeReuse);
    expect(await prisma.personalizedAdjustmentDecision.count({
      where: {
        userId: user.id,
        sourcePersonalizedRecipeVersionId: v5.id,
        resultPersonalizedRecipeVersionId: v6.id,
      },
    })).toBe(2);
  });

  it('keeps existing rows marked as engine provenance without a fabricated parent', async () => {
    const existing = await prisma.personalizedRecipeVersion.findMany({
      where: { userId: { notIn: userIds } },
      take: 10,
    });
    expect(existing.every((version) => version.originType === 'taste_engine'
      && version.parentPersonalizedRecipeVersionId === null)).toBe(true);
    expect(versionId).toEqual(expect.any(String));
  });
});

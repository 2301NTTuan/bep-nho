import { createHash } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type HouseholdPersonalizedRecipeVersion } from '@prisma/client';
import { aggregateFamilyTaste, type FamilyTasteInput, type TasteDimensionKey } from '@bep-nho/domain';
import { RecipePublishLockService } from '../admin/recipe-publish-lock.service';
import { PrismaService } from '../database/prisma.service';
import { HouseholdLockService } from '../database/household-lock.service';

const ALGORITHM_VERSION = 'family-personalize-v1';
const TASTE_VERSION = 'taste-v1';
const MIN_CONFIDENCE = 0.2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;

export type LockedFamilyVersionResult = {
  version: HouseholdPersonalizedRecipeVersion;
  reused: boolean;
  recipe: { id: string; slug: string; title: string };
  baseVersion: { id: string; versionNo: number };
  servings: number;
  currentFamilyTaste: Prisma.InputJsonValue;
};

@Injectable()
export class FamilyPersonalizationService {
  private readonly logger = new Logger(FamilyPersonalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly householdLock: HouseholdLockService,
    private readonly recipeLock: RecipePublishLockService,
  ) {}

  private serialize(version: {
    id: string; versionNo: number; algorithmVersion: string; createdAt: Date;
    familyTasteSnapshotJson: Prisma.JsonValue; snapshotJson: Prisma.JsonValue;
  }, reused?: boolean) {
    return {
      id: version.id,
      versionNo: version.versionNo,
      algorithmVersion: version.algorithmVersion,
      createdAt: version.createdAt,
      familyTaste: version.familyTasteSnapshotJson,
      snapshot: version.snapshotJson,
      ...(reused === undefined ? {} : { reused }),
    };
  }

  async create(userId: string, slug: string) {
    const discovered = await this.prisma.recipe.findUnique({ where: { slug }, select: { id: true } });
    if (!discovered) throw new NotFoundException('Household recipe was not found.');
    const persisted = await this.createForUserAndRecipe(userId, discovered.id);
    this.logger.log(`Household event: family version ${persisted.reused ? 'reused' : 'generated'}`);
    return { data: this.serialize(persisted.version, persisted.reused) };
  }

  async createByRecipeId(userId: string, recipeId: string): Promise<LockedFamilyVersionResult> {
    const persisted = await this.createForUserAndRecipe(userId, recipeId);
    this.logger.log(`Household event: family version ${persisted.reused ? 'reused' : 'generated'}`);
    return persisted;
  }

  private async createForUserAndRecipe(userId: string, recipeId: string) {
    const discoveredMembership = await this.prisma.householdMember.findUnique({ where: { userId } });
    if (!discoveredMembership) throw new NotFoundException('Household recipe was not found.');
    return this.prisma.$transaction(async (tx) => {
      await this.recipeLock.acquire(tx, recipeId, 'family_version');
      await this.householdLock.acquire(tx, discoveredMembership.householdId, 'family_version');
      const membership = await tx.householdMember.findUnique({ where: { userId }, include: { household: true } });
      if (!membership || membership.householdId !== discoveredMembership.householdId || membership.household.status !== 'active') {
        throw new NotFoundException('Household was not found.');
      }
      return this.createForLockedRecipe(tx, membership.householdId, recipeId);
    });
  }

  /** Caller must hold this recipe's publication lock and the household lock, in that order. */
  async createForLockedRecipe(
    tx: Prisma.TransactionClient,
    householdId: string,
    recipeId: string,
  ): Promise<LockedFamilyVersionResult> {
    const recipe = await tx.recipe.findFirst({
      where: { id: recipeId, status: 'published' },
      include: {
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: [{ versionNo: 'desc' }, { id: 'desc' }],
          take: 1,
          include: {
            ingredients: { orderBy: { sortOrder: 'asc' }, include: { ingredient: true } },
            steps: { orderBy: { stepNo: 'asc' } },
            adjustmentRules: { orderBy: [{ ingredientId: 'asc' }, { dimensionKey: 'asc' }] },
          },
        },
      },
    });
    if (!recipe || !recipe.versions[0]) throw new ConflictException('Recipe is not currently published.');
    const base = recipe.versions[0];
    const members = await tx.householdMember.findMany({
      where: { householdId },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      include: {
        user: {
          include: {
            tasteProfiles: {
              where: { algorithmVersion: TASTE_VERSION },
              include: { dimensions: { where: { scopeType: 'global', scopeId: '' } } },
            },
          },
        },
      },
    });
    const inputs: FamilyTasteInput[] = members.flatMap((member) =>
      (member.user.tasteProfiles[0]?.dimensions ?? []).map((dimension) => ({
        dimensionKey: dimension.dimensionKey as TasteDimensionKey,
        score: Number(dimension.score),
        confidence: Number(dimension.confidence),
        manualOverride: dimension.manualOverride === null ? null : Number(dimension.manualOverride),
      })),
    );
    const dimensions = aggregateFamilyTaste(members.length, inputs);
    const familyTasteSnapshot = {
      algorithmVersion: 'family-taste-v1',
      activeMemberCount: members.length,
      dimensions,
    };
    const dimensionsByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
    const rulesByIngredient = new Map<string, typeof base.adjustmentRules>();
    for (const rule of base.adjustmentRules) {
      const existing = rulesByIngredient.get(rule.ingredientId) ?? [];
      existing.push(rule);
      rulesByIngredient.set(rule.ingredientId, existing);
    }
    const adjustments: Array<Record<string, unknown>> = [];
    const ingredients = base.ingredients.map((row) => {
      const baseQuantity = Number(row.quantity);
      let factor = 1;
      const appliedRules: Array<Record<string, unknown>> = [];
      for (const rule of rulesByIngredient.get(row.ingredientId) ?? []) {
        const dimension = dimensionsByKey.get(rule.dimensionKey as TasteDimensionKey);
        if (!dimension || dimension.confidence < MIN_CONFIDENCE) continue;
        const sensitivity = Number(rule.sensitivity);
        const ruleFactor = clamp(
          1 + dimension.score * dimension.confidence * sensitivity,
          Number(rule.minFactor),
          Number(rule.maxFactor),
        );
        factor *= ruleFactor;
        appliedRules.push({ dimension: rule.dimensionKey, score: dimension.score, confidence: dimension.confidence, sensitivity, factor: ruleFactor });
      }
      const quantity = roundQuantity(baseQuantity * factor);
      const deltaPercent = baseQuantity === 0 ? 0 : Math.round(((quantity - baseQuantity) / baseQuantity) * 10000) / 100;
      if (appliedRules.length) adjustments.push({
        ingredientSlug: row.ingredient.slug, ingredientName: row.ingredient.canonicalName,
        baseQuantity, quantity, unit: row.unit, deltaPercent, rules: appliedRules,
      });
      return {
        id: row.ingredient.id, slug: row.ingredient.slug, name: row.ingredient.canonicalName,
        category: row.ingredient.category, baseQuantity, personalizationFactor: factor, quantity,
        unit: row.unit, preparation: row.preparation, note: row.note, sortOrder: row.sortOrder,
        scalingMode: row.scalingMode, scalingExponent: Number(row.scalingExponent),
        roundingIncrement: row.roundingIncrement === null ? null : Number(row.roundingIncrement),
        personalized: appliedRules.length > 0, deltaPercent, appliedRules,
      };
    });
    const snapshot = {
      recipe: { id: recipe.id, slug: recipe.slug, title: recipe.canonicalTitle, cuisine: recipe.cuisine },
      baseVersion: { id: base.id, versionNo: base.versionNo },
      servings: Number(base.servings), prepTimeMinutes: base.prepTimeMinutes,
      cookTimeMinutes: base.cookTimeMinutes, summary: base.summary, ingredients,
      steps: base.steps.map((step) => ({
        stepNo: step.stepNo, instruction: step.instruction, durationSeconds: step.durationSeconds,
        heatLevel: step.heatLevel, tip: step.tip,
      })),
      adjustments,
    };
    const effectiveContent = {
      algorithmVersion: ALGORITHM_VERSION, recipe: snapshot.recipe, baseVersion: snapshot.baseVersion,
      servings: snapshot.servings, prepTimeMinutes: snapshot.prepTimeMinutes,
      cookTimeMinutes: snapshot.cookTimeMinutes, summary: snapshot.summary,
      ingredients: snapshot.ingredients.map((ingredient) => ({
        slug: ingredient.slug, quantity: ingredient.quantity, personalizationFactor: ingredient.personalizationFactor,
        unit: ingredient.unit, preparation: ingredient.preparation, note: ingredient.note,
        sortOrder: ingredient.sortOrder, scalingMode: ingredient.scalingMode,
        scalingExponent: ingredient.scalingExponent, roundingIncrement: ingredient.roundingIncrement,
      })),
      steps: snapshot.steps,
    };
    const contentHash = createHash('sha256').update(JSON.stringify(effectiveContent)).digest('hex');
    const existing = await tx.householdPersonalizedRecipeVersion.findUnique({
      where: { householdId_recipeId_contentHash: { householdId, recipeId: recipe.id, contentHash } },
    });
    const common = {
      recipe: { id: recipe.id, slug: recipe.slug, title: recipe.canonicalTitle },
      baseVersion: { id: base.id, versionNo: base.versionNo },
      servings: Number(base.servings),
      currentFamilyTaste: familyTasteSnapshot as Prisma.InputJsonValue,
    };
    if (existing) return { version: existing, reused: true, ...common };
    const aggregate = await tx.householdPersonalizedRecipeVersion.aggregate({
      where: { householdId, recipeId: recipe.id }, _max: { versionNo: true },
    });
    const version = await tx.householdPersonalizedRecipeVersion.create({
      data: {
        householdId, recipeId: recipe.id, baseRecipeVersionId: base.id,
        versionNo: (aggregate._max.versionNo ?? 0) + 1, algorithmVersion: ALGORITHM_VERSION, contentHash,
        familyTasteSnapshotJson: familyTasteSnapshot as Prisma.InputJsonValue,
        snapshotJson: snapshot as Prisma.InputJsonValue,
      },
    });
    return { version, reused: false, ...common };
  }

  async latest(userId: string, slug: string) {
    const membership = await this.prisma.householdMember.findUnique({ where: { userId }, include: { household: true } });
    if (!membership || membership.household.status !== 'active') throw new NotFoundException('Household was not found.');
    const recipe = await this.prisma.recipe.findUnique({ where: { slug } });
    if (!recipe) throw new NotFoundException(`Recipe '${slug}' was not found.`);
    const version = await this.prisma.householdPersonalizedRecipeVersion.findFirst({
      where: { householdId: membership.householdId, recipeId: recipe.id },
      orderBy: [{ versionNo: 'desc' }, { id: 'desc' }],
    });
    if (!version) throw new NotFoundException('Household personalized recipe version was not found.');
    return { data: this.serialize(version) };
  }
}

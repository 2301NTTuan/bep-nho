import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SCALING_MODES, TASTE_DIMENSION_KEYS } from '@bep-nho/contracts';
import { PrismaService } from '../database/prisma.service';
import { CreateAdminRecipeDto, UpdateRecipeDraftDto } from './dto/admin-recipe.dto';
import { RecipePublishLockService, type RecipePublishOperation } from './recipe-publish-lock.service';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scalingModes = new Set<string>(SCALING_MODES);
const tasteDimensions = new Set<string>(TASTE_DIMENSION_KEYS);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type DraftIngredient = {
  slug: string;
  canonicalName: string;
  category: string | null;
  createIfMissing: boolean;
  quantity: number;
  unit: string;
  preparation: string | null;
  note: string | null;
  sortOrder: number;
  scalingMode: string;
  scalingExponent: number;
  roundingIncrement: number | null;
};

type DraftStep = {
  stepNo: number;
  instruction: string;
  durationSeconds: number | null;
  heatLevel: string | null;
  tip: string | null;
};

type DraftRule = {
  ingredientSlug: string;
  dimensionKey: string;
  sensitivity: number;
  minFactor: number;
  maxFactor: number;
};

export type RecipeDraftContent = {
  slug: string;
  title: string;
  cuisine: string;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  summary: string | null;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  adjustmentRules: DraftRule[];
  heroMediaAssetId: string | null;
  heroMediaAlt: string | null;
};

const emptyContent = (dto: CreateAdminRecipeDto): RecipeDraftContent => ({
  slug: dto.slug,
  title: dto.title.trim(),
  cuisine: dto.cuisine?.trim() || 'vietnamese',
  servings: 2,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  summary: null,
  ingredients: [],
  steps: [],
  adjustmentRules: [],
  heroMediaAssetId: null,
  heroMediaAlt: null,
});

function asContent(value: Prisma.JsonValue): RecipeDraftContent {
  return value as unknown as RecipeDraftContent;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function hashContent(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

@Injectable()
export class AdminRecipesService {
  private readonly logger = new Logger(AdminRecipesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publishLock: RecipePublishLockService,
  ) {}

  async list() {
    const recipes = await this.prisma.recipe.findMany({
      orderBy: [{ updatedAt: 'desc' }, { canonicalTitle: 'asc' }],
      include: {
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: { id: true, versionNo: true, publishedAt: true },
        },
        drafts: {
          where: { status: 'draft' },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, revision: true, updatedAt: true },
        },
      },
    });
    return { data: recipes.map((recipe) => ({
      id: recipe.id,
      slug: recipe.slug,
      title: recipe.canonicalTitle,
      cuisine: recipe.cuisine,
      status: recipe.status,
      latestPublishedVersion: recipe.versions[0] ?? null,
      drafts: recipe.drafts,
    })) };
  }

  async detail(recipeId: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: { versionNo: 'desc' },
          select: { id: true, versionNo: true, contentHash: true, publishedAt: true },
        },
        drafts: { orderBy: { updatedAt: 'desc' } },
      },
    });
    if (!recipe) throw new NotFoundException('Recipe was not found.');
    return { data: { ...recipe, drafts: recipe.drafts.map((draft) => this.serializeDraft(draft)) } };
  }

  async create(userId: string, dto: CreateAdminRecipeDto) {
    const content = emptyContent(dto);
    try {
      const draft = await this.prisma.$transaction(async (tx) => {
        const recipe = await tx.recipe.create({
          data: {
            slug: dto.slug,
            canonicalTitle: content.title,
            cuisine: content.cuisine,
            status: 'draft',
          },
        });
        return tx.recipeDraft.create({
          data: {
            recipeId: recipe.id,
            contentJson: content as unknown as Prisma.InputJsonValue,
            createdByUserId: userId,
            updatedByUserId: userId,
          },
        });
      });
      this.logger.log('Editorial event: recipe draft created');
      return { data: this.serializeDraft(draft) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Recipe slug is already in use.');
      }
      throw error;
    }
  }

  async createDraft(userId: string, recipeId: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: { versionNo: 'desc' },
          take: 1,
          include: {
            ingredients: { orderBy: { sortOrder: 'asc' }, include: { ingredient: true } },
            steps: { orderBy: { stepNo: 'asc' } },
            adjustmentRules: { include: { ingredient: true } },
          },
        },
      },
    });
    if (!recipe) throw new NotFoundException('Recipe was not found.');
    const version = recipe.versions[0];
    if (!version) throw new ConflictException('An unpublished recipe already has its initial draft.');
    const content: RecipeDraftContent = {
      slug: recipe.slug,
      title: recipe.canonicalTitle,
      cuisine: recipe.cuisine,
      servings: Number(version.servings),
      prepTimeMinutes: version.prepTimeMinutes,
      cookTimeMinutes: version.cookTimeMinutes,
      summary: version.summary,
      ingredients: version.ingredients.map((row) => ({
        slug: row.ingredient.slug,
        canonicalName: row.ingredient.canonicalName,
        category: row.ingredient.category,
        createIfMissing: false,
        quantity: Number(row.quantity),
        unit: row.unit,
        preparation: row.preparation,
        note: row.note,
        sortOrder: row.sortOrder,
        scalingMode: row.scalingMode,
        scalingExponent: Number(row.scalingExponent),
        roundingIncrement: row.roundingIncrement === null ? null : Number(row.roundingIncrement),
      })),
      steps: version.steps.map((step) => ({
        stepNo: step.stepNo,
        instruction: step.instruction,
        durationSeconds: step.durationSeconds,
        heatLevel: step.heatLevel,
        tip: step.tip,
      })),
      adjustmentRules: version.adjustmentRules.map((rule) => ({
        ingredientSlug: rule.ingredient.slug,
        dimensionKey: rule.dimensionKey,
        sensitivity: Number(rule.sensitivity),
        minFactor: Number(rule.minFactor),
        maxFactor: Number(rule.maxFactor),
      })),
      heroMediaAssetId: version.heroMediaAssetId,
      heroMediaAlt: version.heroMediaAlt,
    };
    const draft = await this.prisma.recipeDraft.create({
      data: {
        recipeId,
        baseRecipeVersionId: version.id,
        contentJson: content as unknown as Prisma.InputJsonValue,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });
    this.logger.log('Editorial event: recipe draft created');
    return { data: this.serializeDraft(draft) };
  }

  async getDraft(draftId: string) {
    const draft = await this.prisma.recipeDraft.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('Recipe draft was not found.');
    return { data: this.serializeDraft(draft) };
  }

  async updateDraft(userId: string, draftId: string, dto: UpdateRecipeDraftDto) {
    const content = this.normalizeContent(dto.content);
    const draft = await this.prisma.$transaction(async (tx) => {
      const current = await tx.recipeDraft.findUnique({ where: { id: draftId } });
      if (!current) throw new NotFoundException('Recipe draft was not found.');
      if (current.status !== 'draft') throw new ConflictException('Recipe draft is no longer editable.');
      const publishedCount = await tx.recipeVersion.count({
        where: { recipeId: current.recipeId, publishedAt: { not: null } },
      });
      if (content.heroMediaAssetId && UUID_PATTERN.test(content.heroMediaAssetId)) {
        await this.requireActiveMedia(tx, content.heroMediaAssetId);
      }
      const updated = await tx.recipeDraft.updateMany({
        where: { id: draftId, status: 'draft', revision: dto.expectedRevision },
        data: {
          contentJson: content as unknown as Prisma.InputJsonValue,
          revision: { increment: 1 },
          updatedByUserId: userId,
        },
      });
      if (updated.count !== 1) throw new ConflictException('Draft revision is stale. Reload before editing.');
      if (publishedCount === 0) {
        try {
          await tx.recipe.update({
            where: { id: current.recipeId },
            data: { slug: content.slug, canonicalTitle: content.title, cuisine: content.cuisine },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('Recipe slug is already in use.');
          }
          throw error;
        }
      } else {
        const recipe = await tx.recipe.findUniqueOrThrow({ where: { id: current.recipeId } });
        if (content.slug !== recipe.slug) throw new ConflictException('A published recipe slug is immutable.');
      }
      return tx.recipeDraft.findUniqueOrThrow({ where: { id: draftId } });
    });
    this.logger.log('Editorial event: recipe draft updated');
    return { data: this.serializeDraft(draft) };
  }

  async publish(userId: string, draftId: string, expectedRevision: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.recipeDraft.findUnique({
        where: { id: draftId },
        select: { recipeId: true },
      });
      if (!candidate) throw new NotFoundException('Recipe draft was not found.');
      await this.publishLock.acquire(tx, candidate.recipeId, 'publish');
      const draft = await tx.recipeDraft.findUnique({ where: { id: draftId } });
      if (!draft) throw new NotFoundException('Recipe draft was not found.');
      if (draft.status !== 'draft' || draft.revision !== expectedRevision) {
        throw new ConflictException('Recipe draft is stale or no longer editable.');
      }
      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id: draft.recipeId } });
      const latest = await tx.recipeVersion.findFirst({
        where: { recipeId: recipe.id, publishedAt: { not: null } },
        orderBy: { versionNo: 'desc' },
        include: {
          ingredients: { orderBy: { sortOrder: 'asc' }, include: { ingredient: true } },
          steps: { orderBy: { stepNo: 'asc' } },
          adjustmentRules: { include: { ingredient: true } },
        },
      });
      if ((latest?.id ?? null) !== draft.baseRecipeVersionId) {
        throw new ConflictException('Draft is based on an older published recipe version.');
      }
      const content = this.validateForPublish(asContent(draft.contentJson));
      if (latest && content.slug !== recipe.slug) {
        throw new ConflictException('A published recipe slug is immutable.');
      }

      if (content.heroMediaAssetId) await this.requireActiveMedia(tx, content.heroMediaAssetId);

      const ingredientIds = new Map<string, string>();
      const ingredientMetadata = new Map<string, { canonicalName: string; category: string | null }>();
      for (const item of content.ingredients) {
        const existing = await tx.ingredient.findUnique({ where: { slug: item.slug } });
        if (existing) {
          ingredientIds.set(item.slug, existing.id);
          ingredientMetadata.set(item.slug, {
            canonicalName: existing.canonicalName,
            category: existing.category,
          });
          continue;
        }
        if (!item.createIfMissing) {
          throw new UnprocessableEntityException(`Ingredient '${item.slug}' does not exist.`);
        }
        const created = await tx.ingredient.create({
          data: { slug: item.slug, canonicalName: item.canonicalName, category: item.category },
        });
        ingredientIds.set(item.slug, created.id);
        ingredientMetadata.set(item.slug, {
          canonicalName: created.canonicalName,
          category: created.category,
        });
      }

      const resolvedContent: RecipeDraftContent = {
        ...content,
        ingredients: content.ingredients.map((item) => ({
          ...item,
          ...ingredientMetadata.get(item.slug)!,
        })),
      };
      const effective = this.effectiveContent(resolvedContent);
      const contentHash = hashContent(effective);
      const latestEffectiveHash = latest
        ? hashContent(this.effectiveContent({
            slug: recipe.slug,
            title: recipe.canonicalTitle,
            cuisine: recipe.cuisine,
            servings: Number(latest.servings),
            prepTimeMinutes: latest.prepTimeMinutes,
            cookTimeMinutes: latest.cookTimeMinutes,
            summary: latest.summary,
            ingredients: latest.ingredients.map((item) => ({
              slug: item.ingredient.slug,
              canonicalName: item.ingredient.canonicalName,
              category: item.ingredient.category,
              createIfMissing: false,
              quantity: Number(item.quantity),
              unit: item.unit,
              preparation: item.preparation,
              note: item.note,
              sortOrder: item.sortOrder,
              scalingMode: item.scalingMode,
              scalingExponent: Number(item.scalingExponent),
              roundingIncrement: item.roundingIncrement === null ? null : Number(item.roundingIncrement),
            })),
            steps: latest.steps.map((step) => ({
              stepNo: step.stepNo,
              instruction: step.instruction,
              durationSeconds: step.durationSeconds,
              heatLevel: step.heatLevel,
              tip: step.tip,
            })),
            adjustmentRules: latest.adjustmentRules.map((rule) => ({
              ingredientSlug: rule.ingredient.slug,
              dimensionKey: rule.dimensionKey,
              sensitivity: Number(rule.sensitivity),
              minFactor: Number(rule.minFactor),
              maxFactor: Number(rule.maxFactor),
            })).sort((left, right) => compareText(
              `${left.ingredientSlug}:${left.dimensionKey}`,
              `${right.ingredientSlug}:${right.dimensionKey}`,
            )),
            heroMediaAssetId: latest.heroMediaAssetId,
            heroMediaAlt: latest.heroMediaAlt,
          }))
        : null;
      if (latestEffectiveHash === contentHash) {
        throw new ConflictException('NO_EFFECTIVE_CHANGE');
      }
      const publishedAt = new Date();
      const version = await tx.recipeVersion.create({
        data: {
          recipeId: recipe.id,
          versionNo: (latest?.versionNo ?? 0) + 1,
          servings: resolvedContent.servings,
          prepTimeMinutes: resolvedContent.prepTimeMinutes,
          cookTimeMinutes: resolvedContent.cookTimeMinutes,
          summary: resolvedContent.summary,
          contentHash,
          publishedAt,
          heroMediaAssetId: resolvedContent.heroMediaAssetId,
          heroMediaAlt: resolvedContent.heroMediaAlt,
          publishedByUserId: userId,
        },
      });
      await tx.recipeIngredient.createMany({ data: resolvedContent.ingredients.map((item) => ({
        recipeVersionId: version.id,
        ingredientId: ingredientIds.get(item.slug)!,
        quantity: item.quantity,
        unit: item.unit,
        preparation: item.preparation,
        note: item.note,
        sortOrder: item.sortOrder,
        scalingMode: item.scalingMode,
        scalingExponent: item.scalingExponent,
        roundingIncrement: item.roundingIncrement,
      })) });
      await tx.recipeStep.createMany({ data: resolvedContent.steps.map((step) => ({
        recipeVersionId: version.id,
        ...step,
      })) });
      if (resolvedContent.adjustmentRules.length > 0) {
        await tx.recipeAdjustmentRule.createMany({ data: resolvedContent.adjustmentRules.map((rule) => ({
          recipeVersionId: version.id,
          ingredientId: ingredientIds.get(rule.ingredientSlug)!,
          dimensionKey: rule.dimensionKey,
          sensitivity: rule.sensitivity,
          minFactor: rule.minFactor,
          maxFactor: rule.maxFactor,
        })) });
      }
      await tx.recipe.update({
        where: { id: recipe.id },
        data: {
          slug: resolvedContent.slug,
          canonicalTitle: resolvedContent.title,
          cuisine: resolvedContent.cuisine,
          status: 'published',
        },
      });
      await tx.recipeDraft.update({
        where: { id: draft.id },
        data: { status: 'published', updatedByUserId: userId },
      });
      return { recipeId: recipe.id, recipeSlug: resolvedContent.slug, versionId: version.id, versionNo: version.versionNo };
    }, { timeout: 20_000 });
    this.logger.log('Editorial event: recipe published');
    return { data: result };
  }

  async archive(recipeId: string) {
    const recipe = await this.lockRecipeAndSetStatus(recipeId, 'archived', false, 'archive');
    this.logger.log('Editorial event: recipe archived');
    return { data: recipe };
  }

  async restore(recipeId: string) {
    const recipe = await this.lockRecipeAndSetStatus(recipeId, 'published', true, 'restore');
    this.logger.log('Editorial event: recipe restored');
    return { data: recipe };
  }

  private async lockRecipeAndSetStatus(
    recipeId: string,
    status: string,
    requireVersion: boolean,
    operation: RecipePublishOperation,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.publishLock.acquire(tx, recipeId, operation);
      const recipe = await tx.recipe.findUnique({ where: { id: recipeId } });
      if (!recipe) throw new NotFoundException('Recipe was not found.');
      if (requireVersion) {
        const count = await tx.recipeVersion.count({
          where: { recipeId, publishedAt: { not: null } },
        });
        if (count === 0) throw new ConflictException('Recipe has no published version to restore.');
      }
      return tx.recipe.update({ where: { id: recipeId }, data: { status } });
    });
  }

  private serializeDraft(draft: {
    id: string;
    recipeId: string;
    baseRecipeVersionId: string | null;
    status: string;
    revision: number;
    contentJson: Prisma.JsonValue;
    createdByUserId: string | null;
    updatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: draft.id,
      recipeId: draft.recipeId,
      baseRecipeVersionId: draft.baseRecipeVersionId,
      status: draft.status,
      revision: draft.revision,
      content: draft.contentJson,
      createdByUserId: draft.createdByUserId,
      updatedByUserId: draft.updatedByUserId,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    };
  }

  private async requireActiveMedia(tx: Prisma.TransactionClient, mediaId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "media_assets"
      WHERE "id" = ${mediaId}::uuid
        AND "status" = 'active'
      FOR SHARE
    `;
    if (rows.length !== 1) throw new UnprocessableEntityException('Hero media is missing or inactive.');
  }

  private normalizeContent(input: Record<string, unknown>): RecipeDraftContent {
    return input as unknown as RecipeDraftContent;
  }

  private validateForPublish(content: RecipeDraftContent): RecipeDraftContent {
    const errors: string[] = [];
    if (!content || typeof content !== 'object') throw new BadRequestException('Draft content is required.');
    const slug = typeof content.slug === 'string' ? content.slug.trim() : '';
    const title = typeof content.title === 'string' ? content.title.trim() : '';
    const cuisine = typeof content.cuisine === 'string' ? content.cuisine.trim() : '';
    const summary = typeof content.summary === 'string' ? content.summary.trim() || null : content.summary;
    const ingredients = Array.isArray(content.ingredients) ? content.ingredients : [];
    const steps = Array.isArray(content.steps) ? content.steps : [];
    const rules = Array.isArray(content.adjustmentRules) ? content.adjustmentRules : [];
    if (!SLUG_PATTERN.test(slug) || slug.length > 180) errors.push('Valid slug is required.');
    if (!title || title.length > 180) errors.push('Recipe title is required.');
    if (!cuisine || cuisine.length > 64) errors.push('Cuisine is required.');
    if (summary !== null && typeof summary !== 'string') errors.push('Recipe summary is invalid.');
    if (!Number.isInteger(content.servings) || content.servings < 1 || content.servings > 8) errors.push('Servings must be an integer from 1 to 8.');
    for (const [label, value] of [['prep time', content.prepTimeMinutes], ['cook time', content.cookTimeMinutes]] as const) {
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1440)) errors.push(`${label} is invalid.`);
    }
    if (ingredients.length === 0) errors.push('At least one ingredient is required.');
    if (steps.length === 0) errors.push('At least one step is required.');
    if (!Array.isArray(content.adjustmentRules)) errors.push('Adjustment rules must be an array.');
    const slugs = new Set<string>();
    const orders = new Set<number>();
    for (const item of ingredients) {
      if (!item || typeof item !== 'object') { errors.push('Every ingredient must be an object.'); continue; }
      if (typeof item.slug !== 'string' || !SLUG_PATTERN.test(item.slug) || item.slug.length > 180 || slugs.has(item.slug)) errors.push('Ingredient slugs must be valid and unique.');
      slugs.add(item.slug);
      if (typeof item.canonicalName !== 'string' || !item.canonicalName.trim() || item.canonicalName.length > 180) errors.push(`Ingredient '${item.slug}' requires a canonical name.`);
      if (item.category !== null && (typeof item.category !== 'string' || item.category.length > 64)) errors.push(`Ingredient '${item.slug}' category is invalid.`);
      if (!Number.isFinite(item.quantity) || !(item.quantity > 0) || item.quantity > 9_999_999) errors.push(`Ingredient '${item.slug}' requires a positive quantity.`);
      if (typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length > 32) errors.push(`Ingredient '${item.slug}' requires a unit.`);
      if (item.preparation !== null && (typeof item.preparation !== 'string' || item.preparation.length > 255)) errors.push(`Ingredient '${item.slug}' preparation is invalid.`);
      if (item.note !== null && (typeof item.note !== 'string' || item.note.length > 255)) errors.push(`Ingredient '${item.slug}' note is invalid.`);
      if (typeof item.createIfMissing !== 'boolean') errors.push(`Ingredient '${item.slug}' creation policy is required.`);
      if (!Number.isInteger(item.sortOrder) || item.sortOrder < 1 || orders.has(item.sortOrder)) errors.push('Ingredient sort order must be positive and unique.');
      orders.add(item.sortOrder);
      if (!scalingModes.has(item.scalingMode)) errors.push(`Ingredient '${item.slug}' has invalid scaling mode.`);
      if (!Number.isFinite(item.scalingExponent) || !(item.scalingExponent > 0 && item.scalingExponent <= 1)) errors.push(`Ingredient '${item.slug}' has invalid scaling exponent.`);
      if (item.roundingIncrement !== null && (!Number.isFinite(item.roundingIncrement) || !(item.roundingIncrement > 0) || item.roundingIncrement > 9_999_999)) errors.push(`Ingredient '${item.slug}' has invalid rounding increment.`);
    }
    const stepNumbers = new Set<number>();
    for (const step of steps) {
      if (!step || typeof step !== 'object') { errors.push('Every step must be an object.'); continue; }
      if (!Number.isInteger(step.stepNo) || step.stepNo < 1 || stepNumbers.has(step.stepNo)) errors.push('Step numbers must be positive and unique.');
      stepNumbers.add(step.stepNo);
      if (typeof step.instruction !== 'string' || !step.instruction.trim()) errors.push(`Step ${step.stepNo} requires an instruction.`);
      if (step.durationSeconds !== null && (!Number.isInteger(step.durationSeconds) || step.durationSeconds < 0)) errors.push(`Step ${step.stepNo} duration is invalid.`);
      if (step.heatLevel !== null && (typeof step.heatLevel !== 'string' || step.heatLevel.length > 32)) errors.push(`Step ${step.stepNo} heat level is invalid.`);
      if (step.tip !== null && (typeof step.tip !== 'string' || step.tip.length > 2000)) errors.push(`Step ${step.stepNo} tip is invalid.`);
    }
    const ruleIdentities = new Set<string>();
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') { errors.push('Every adjustment rule must be an object.'); continue; }
      const identity = `${rule.ingredientSlug}:${rule.dimensionKey}`;
      if (ruleIdentities.has(identity)) errors.push('Adjustment rules must be unique per ingredient and dimension.');
      ruleIdentities.add(identity);
      if (!slugs.has(rule.ingredientSlug)) errors.push('Adjustment rule must reference a recipe ingredient.');
      if (!tasteDimensions.has(rule.dimensionKey)) errors.push('Adjustment rule has an invalid Taste dimension.');
      if (!Number.isFinite(rule.sensitivity) || Math.abs(rule.sensitivity) > 2) errors.push('Adjustment sensitivity is invalid.');
      if (!(rule.minFactor > 0 && rule.maxFactor >= rule.minFactor && rule.maxFactor <= 3)) errors.push('Adjustment factor bounds are invalid.');
    }
    if (content.heroMediaAssetId !== null && (typeof content.heroMediaAssetId !== 'string' || !UUID_PATTERN.test(content.heroMediaAssetId))) errors.push('Hero media ID is invalid.');
    if (content.heroMediaAssetId && (typeof content.heroMediaAlt !== 'string' || !content.heroMediaAlt.trim() || content.heroMediaAlt.length > 320)) errors.push('Meaningful hero image alt text is required.');
    if (!content.heroMediaAssetId && content.heroMediaAlt) errors.push('Hero alt text requires a hero image.');
    if (errors.length > 0) throw new UnprocessableEntityException(errors.join(' '));
    return {
      ...content,
      slug,
      title,
      cuisine,
      summary: summary as string | null,
      ingredients: ingredients.map((item) => ({
        ...item,
        canonicalName: item.canonicalName.trim(),
        category: item.category?.trim() || null,
        unit: item.unit.trim(),
        preparation: item.preparation?.trim() || null,
        note: item.note?.trim() || null,
      })).sort((a, b) => a.sortOrder - b.sortOrder),
      steps: steps.map((step) => ({
        ...step,
        instruction: step.instruction.trim(),
        heatLevel: step.heatLevel?.trim() || null,
        tip: step.tip?.trim() || null,
      })).sort((a, b) => a.stepNo - b.stepNo),
      adjustmentRules: [...rules].sort((a, b) => compareText(
        `${a.ingredientSlug}:${a.dimensionKey}`,
        `${b.ingredientSlug}:${b.dimensionKey}`,
      )),
      heroMediaAlt: typeof content.heroMediaAlt === 'string' ? content.heroMediaAlt.trim() || null : null,
    };
  }

  private effectiveContent(content: RecipeDraftContent) {
    return {
      slug: content.slug,
      title: content.title,
      cuisine: content.cuisine,
      servings: content.servings,
      prepTimeMinutes: content.prepTimeMinutes,
      cookTimeMinutes: content.cookTimeMinutes,
      summary: content.summary,
      ingredients: content.ingredients.map(({ createIfMissing: _ignored, canonicalName, category, ...item }) => ({
        ...item,
        canonicalName,
        category,
      })),
      steps: content.steps,
      adjustmentRules: content.adjustmentRules,
      heroMediaAssetId: content.heroMediaAssetId,
      heroMediaAlt: content.heroMediaAlt,
    };
  }
}

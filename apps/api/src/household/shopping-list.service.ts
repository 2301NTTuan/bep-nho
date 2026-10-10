import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  formatIsoCalendarDate,
  scaleEffectiveIngredient,
  validateMondayWeekStart,
  type PersonalizedIngredientSource,
} from '@bep-nho/domain';
import { HouseholdLockService } from '../database/household-lock.service';
import { PrismaService } from '../database/prisma.service';

export const SHOPPING_REQUIREMENTS_ALGORITHM_VERSION = 'shopping-requirements-v1';
const STALE_MESSAGE = 'Shopping requirements are stale. Preview again before generating.';

const versionIngredientInclude = Prisma.validator<Prisma.RecipeVersionInclude>()({
  ingredients: {
    orderBy: { sortOrder: 'asc' },
    include: { ingredient: true },
  },
});

const planInclude = Prisma.validator<Prisma.HouseholdMealPlanInclude>()({
  entries: {
    orderBy: [{ plannedDate: 'asc' }, { mealType: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      recipeVersion: { include: versionIngredientInclude },
      householdPersonalizedRecipeVersion: {
        include: { baseRecipeVersion: { include: versionIngredientInclude } },
      },
    },
  },
});

const shoppingListInclude = Prisma.validator<Prisma.HouseholdShoppingListInclude>()({
  items: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { ingredient: true },
  },
});

type Plan = Prisma.HouseholdMealPlanGetPayload<{ include: typeof planInclude }>;
type Version = Prisma.RecipeVersionGetPayload<{ include: typeof versionIngredientInclude }>;
type ShoppingList = Prisma.HouseholdShoppingListGetPayload<{ include: typeof shoppingListInclude }>;

type CalculationLine = {
  ingredient: { id: string; slug: string; name: string; category: string | null };
  unit: string;
  requiredQuantity: number;
  pantryQuantityApplied: number;
  missingQuantity: number;
  pantry: { present: boolean; unit: string | null; unitMatches: boolean };
  sourceEntryCount: number;
};

type Calculation = {
  algorithmVersion: typeof SHOPPING_REQUIREMENTS_ALGORITHM_VERSION;
  weekStart: string;
  inputHash: string;
  contentHash: string;
  summary: {
    mealEntryCount: number;
    requirementLineCount: number;
    missingLineCount: number;
    fullyCoveredLineCount: number;
    unitMismatchCount: number;
  };
  items: CalculationLine[];
  allLines: CalculationLine[];
  mealPlanId: string;
};

function record(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function milli(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000);
}

function quantity(value: number): number {
  return Number((value / 1000).toFixed(3));
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

@Injectable()
export class ShoppingListService {
  private readonly logger = new Logger(ShoppingListService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly householdLock: HouseholdLockService,
  ) {}

  async preview(userId: string, rawWeekStart: string) {
    const weekStart = this.weekStart(rawWeekStart);
    const membership = await this.activeMembership(userId);
    const calculated = await this.prisma.$transaction(async (tx) => {
      await this.householdLock.acquire(tx, membership.householdId, 'shopping_requirements_preview');
      await this.requireMembership(tx, userId, membership.householdId, true);
      return this.calculate(tx, membership.householdId, weekStart, rawWeekStart);
    });
    this.logger.log('Shopping event: shopping_requirements_previewed');
    return { data: this.previewView(calculated) };
  }

  async generate(userId: string, rawWeekStart: string, expectedInputHash: string) {
    const weekStart = this.weekStart(rawWeekStart);
    const membership = await this.activeMembership(userId);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.householdLock.acquire(tx, membership.householdId, 'shopping_list_generate');
        await this.requireMembership(tx, userId, membership.householdId, true);
        const calculated = await this.calculate(tx, membership.householdId, weekStart, rawWeekStart);
        if (calculated.inputHash !== expectedInputHash) throw new ConflictException(STALE_MESSAGE);
        if (calculated.items.length === 0) {
          return { data: { ...this.previewView(calculated), shoppingList: null, reused: false } };
        }

        const existing = await tx.householdShoppingList.findUnique({
          where: {
            householdId_weekStart_contentHash: {
              householdId: membership.householdId,
              weekStart,
              contentHash: calculated.contentHash,
            },
          },
          include: shoppingListInclude,
        });
        if (existing) {
          return { data: { shoppingList: this.serialize(existing), reused: true } };
        }
        const aggregate = await tx.householdShoppingList.aggregate({
          where: { householdId: membership.householdId, weekStart },
          _max: { versionNo: true },
        });
        const created = await tx.householdShoppingList.create({
          data: {
            householdId: membership.householdId,
            mealPlanId: calculated.mealPlanId,
            weekStart,
            versionNo: (aggregate._max.versionNo ?? 0) + 1,
            algorithmVersion: SHOPPING_REQUIREMENTS_ALGORITHM_VERSION,
            inputHash: calculated.inputHash,
            contentHash: calculated.contentHash,
            summaryJson: calculated.summary,
            createdByUserId: userId,
            items: {
              create: calculated.items.map((item, sortOrder) => ({
                ingredientId: item.ingredient.id,
                unit: item.unit,
                requiredQuantity: item.requiredQuantity,
                pantryQuantityApplied: item.pantryQuantityApplied,
                missingQuantity: item.missingQuantity,
                pantryUnit: item.pantry.unit,
                unitMatches: item.pantry.unitMatches,
                sourceEntryCount: item.sourceEntryCount,
                sortOrder,
              })),
            },
          },
          include: shoppingListInclude,
        });
        return { data: { shoppingList: this.serialize(created), reused: false } };
      }, { timeout: 20_000 });
      const data = result.data;
      if ('shoppingList' in data && data.shoppingList && data.reused) {
        this.logger.log('Shopping event: shopping_list_reused');
      } else if ('shoppingList' in data && data.shoppingList) {
        this.logger.log('Shopping event: shopping_list_generated');
      }
      return result;
    } catch (error) {
      if (error instanceof ConflictException) this.logger.warn('Shopping event: shopping_list_stale');
      throw error;
    }
  }

  async latest(userId: string, rawWeekStart: string) {
    const weekStart = this.weekStart(rawWeekStart);
    const membership = await this.currentMembership(userId);
    const list = await this.prisma.householdShoppingList.findFirst({
      where: { householdId: membership.householdId, weekStart },
      orderBy: [{ versionNo: 'desc' }, { id: 'desc' }],
      include: shoppingListInclude,
    });
    if (!list) throw new NotFoundException('Household shopping list was not found.');
    return { data: { shoppingList: this.serialize(list) } };
  }

  async get(userId: string, shoppingListId: string) {
    const membership = await this.currentMembership(userId);
    const list = await this.prisma.householdShoppingList.findFirst({
      where: { id: shoppingListId, householdId: membership.householdId },
      include: shoppingListInclude,
    });
    if (!list) throw new NotFoundException('Household shopping list was not found.');
    return { data: { shoppingList: this.serialize(list) } };
  }

  private async calculate(
    tx: Prisma.TransactionClient,
    householdId: string,
    weekStart: Date,
    rawWeekStart: string,
  ): Promise<Calculation> {
    const plan = await tx.householdMealPlan.findUnique({
      where: { householdId_weekStart: { householdId, weekStart } },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException('Household meal plan was not found.');

    const required = new Map<string, {
      ingredient: CalculationLine['ingredient']; unit: string; requiredMilli: number; entryIds: Set<string>;
    }>();
    const entryInputs: Array<Record<string, unknown>> = [];
    for (const entry of plan.entries) {
      const source = this.entrySource(entry);
      const scaledIngredients = this.scaleVersion(source.base, source.personalized, source.sourceServings, entry.servings);
      entryInputs.push({
        entryId: entry.id,
        plannedDate: formatIsoCalendarDate(entry.plannedDate),
        mealType: entry.mealType,
        servings: entry.servings,
        sourceType: source.type,
        recipeVersionId: entry.recipeVersionId,
        householdPersonalizedRecipeVersionId: entry.householdPersonalizedRecipeVersionId,
        sourceServings: source.sourceServings,
        ingredients: scaledIngredients.map((item) => ({
          ingredientId: item.ingredientId,
          unit: item.unit,
          quantity: item.quantity,
          canonicalQuantity: item.canonicalQuantity,
          personalizationFactor: item.personalizationFactor,
          scalingMode: item.scalingMode,
          scalingExponent: item.scalingExponent,
          roundingIncrement: item.roundingIncrement,
          sortOrder: item.sortOrder,
        })),
      });
      for (const item of scaledIngredients) {
        const unit = item.unit.trim();
        const key = `${item.ingredientId}\u0000${unit}`;
        const current = required.get(key) ?? {
          ingredient: { id: item.ingredientId, slug: item.slug, name: item.name, category: item.category },
          unit,
          requiredMilli: 0,
          entryIds: new Set<string>(),
        };
        current.requiredMilli += milli(item.quantity);
        current.entryIds.add(entry.id);
        required.set(key, current);
      }
    }

    const ingredientIds = [...new Set([...required.values()].map((item) => item.ingredient.id))].sort();
    const pantry = ingredientIds.length === 0 ? [] : await tx.householdPantryItem.findMany({
      where: { householdId, ingredientId: { in: ingredientIds } },
      orderBy: [{ ingredientId: 'asc' }, { id: 'asc' }],
    });
    const pantryByIngredient = new Map(pantry.map((item) => [item.ingredientId, item]));
    const allLines = [...required.values()].map((item): CalculationLine => {
      const pantryItem = pantryByIngredient.get(item.ingredient.id);
      const unitMatches = pantryItem?.unit.trim() === item.unit;
      const requiredMilli = item.requiredMilli;
      const appliedMilli = unitMatches ? Math.min(requiredMilli, milli(Number(pantryItem.quantity))) : 0;
      return {
        ingredient: item.ingredient,
        unit: item.unit,
        requiredQuantity: quantity(requiredMilli),
        pantryQuantityApplied: quantity(appliedMilli),
        missingQuantity: quantity(Math.max(requiredMilli - appliedMilli, 0)),
        pantry: {
          present: pantryItem !== undefined,
          unit: pantryItem?.unit ?? null,
          unitMatches,
        },
        sourceEntryCount: item.entryIds.size,
      };
    }).sort((left, right) => (
      compareText(left.ingredient.name, right.ingredient.name)
      || compareText(left.ingredient.id, right.ingredient.id)
      || compareText(left.unit, right.unit)
    ));
    const items = allLines.filter((item) => item.missingQuantity > 0);
    const summary = {
      mealEntryCount: plan.entries.length,
      requirementLineCount: allLines.length,
      missingLineCount: items.length,
      fullyCoveredLineCount: allLines.length - items.length,
      unitMismatchCount: allLines.filter((item) => item.pantry.present && !item.pantry.unitMatches).length,
    };
    const pantryInputs = pantry.map((item) => ({
      ingredientId: item.ingredientId,
      quantity: Number(item.quantity),
      unit: item.unit,
      revision: item.revision,
    }));
    const inputHash = hash({
      algorithmVersion: SHOPPING_REQUIREMENTS_ALGORITHM_VERSION,
      householdId,
      mealPlanId: plan.id,
      weekStart: rawWeekStart,
      entries: entryInputs,
      pantry: pantryInputs,
    });
    const contentHash = hash({
      algorithmVersion: SHOPPING_REQUIREMENTS_ALGORITHM_VERSION,
      lines: allLines.map((item) => ({
        ingredientId: item.ingredient.id,
        unit: item.unit,
        requiredQuantity: item.requiredQuantity,
        pantryQuantityApplied: item.pantryQuantityApplied,
        missingQuantity: item.missingQuantity,
        pantryUnit: item.pantry.unit,
        unitMatches: item.pantry.unitMatches,
        sourceEntryCount: item.sourceEntryCount,
      })),
    });
    return {
      algorithmVersion: SHOPPING_REQUIREMENTS_ALGORITHM_VERSION,
      weekStart: rawWeekStart,
      inputHash,
      contentHash,
      summary,
      items,
      allLines,
      mealPlanId: plan.id,
    };
  }

  private entrySource(entry: Plan['entries'][number]) {
    if (entry.recipeVersion) {
      return { type: 'canonical' as const, base: entry.recipeVersion, personalized: null, sourceServings: Number(entry.recipeVersion.servings) };
    }
    const household = entry.householdPersonalizedRecipeVersion;
    if (!household) throw new InternalServerErrorException('Meal-plan recipe provenance is invalid.');
    const snapshot = record(household.snapshotJson);
    const sourceServings = finite(snapshot?.servings);
    const rawIngredients = snapshot?.ingredients;
    if (!sourceServings || sourceServings <= 0 || !Array.isArray(rawIngredients)) {
      throw new InternalServerErrorException('Household recipe snapshot is malformed.');
    }
    const personalized = rawIngredients.map((item) => record(item as Prisma.JsonValue));
    if (personalized.some((item) => item === null)) {
      throw new InternalServerErrorException('Household recipe snapshot is malformed.');
    }
    return {
      type: 'household' as const,
      base: household.baseRecipeVersion,
      personalized: personalized as Record<string, unknown>[],
      sourceServings,
    };
  }

  private scaleVersion(
    base: Version,
    personalized: Record<string, unknown>[] | null,
    sourceServings: number,
    targetServings: number,
  ) {
    return base.ingredients.map((row) => {
      const raw = personalized?.find((item) => item.id === row.ingredientId || item.slug === row.ingredient.slug) ?? null;
      if (personalized && !raw) throw new InternalServerErrorException('Household recipe snapshot is malformed.');
      const parsed = raw ? this.personalizedIngredient(raw) : null;
      return scaleEffectiveIngredient({
        ingredientId: row.ingredientId,
        slug: row.ingredient.slug,
        name: row.ingredient.canonicalName,
        category: row.ingredient.category,
        quantity: Number(row.quantity),
        unit: row.unit,
        sortOrder: row.sortOrder,
        scalingMode: row.scalingMode,
        scalingExponent: Number(row.scalingExponent),
        roundingIncrement: row.roundingIncrement === null ? null : Number(row.roundingIncrement),
      }, parsed, sourceServings, targetServings);
    });
  }

  private personalizedIngredient(value: Record<string, unknown>): PersonalizedIngredientSource {
    const quantityValue = finite(value.quantity);
    const baseQuantity = finite(value.baseQuantity);
    const unit = typeof value.unit === 'string' ? value.unit.trim() : '';
    if (quantityValue === null || baseQuantity === null || baseQuantity <= 0 || !unit) {
      throw new InternalServerErrorException('Household recipe snapshot is malformed.');
    }
    return {
      ingredientId: typeof value.id === 'string' ? value.id : undefined,
      slug: typeof value.slug === 'string' ? value.slug : undefined,
      name: typeof value.name === 'string' ? value.name : undefined,
      category: typeof value.category === 'string' || value.category === null
        ? value.category as string | null
        : undefined,
      baseQuantity,
      quantity: quantityValue,
      personalizationFactor: finite(value.personalizationFactor) ?? undefined,
      unit,
      sortOrder: finite(value.sortOrder) ?? undefined,
      scalingMode: typeof value.scalingMode === 'string' ? value.scalingMode : undefined,
      scalingExponent: finite(value.scalingExponent) ?? undefined,
      roundingIncrement: value.roundingIncrement === null ? null : finite(value.roundingIncrement) ?? undefined,
    };
  }

  private previewView(calculated: Calculation) {
    return {
      algorithmVersion: calculated.algorithmVersion,
      weekStart: calculated.weekStart,
      inputHash: calculated.inputHash,
      summary: calculated.summary,
      items: calculated.items,
    };
  }

  private serialize(list: ShoppingList) {
    const summary = record(list.summaryJson) ?? {};
    return {
      id: list.id,
      weekStart: formatIsoCalendarDate(list.weekStart),
      versionNo: list.versionNo,
      algorithmVersion: list.algorithmVersion,
      inputHash: list.inputHash,
      contentHash: list.contentHash,
      summary,
      createdAt: list.createdAt,
      items: list.items.map((item) => ({
        ingredient: {
          id: item.ingredient.id,
          slug: item.ingredient.slug,
          name: item.ingredient.canonicalName,
          category: item.ingredient.category,
        },
        unit: item.unit,
        requiredQuantity: Number(item.requiredQuantity),
        pantryQuantityApplied: Number(item.pantryQuantityApplied),
        missingQuantity: Number(item.missingQuantity),
        pantry: {
          present: item.pantryUnit !== null,
          unit: item.pantryUnit,
          unitMatches: item.unitMatches,
        },
        sourceEntryCount: item.sourceEntryCount,
      })),
    };
  }

  private weekStart(value: string) {
    try {
      return validateMondayWeekStart(value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid weekStart.');
    }
  }

  private async currentMembership(userId: string) {
    const membership = await this.prisma.householdMember.findUnique({
      where: { userId },
      select: { householdId: true, household: { select: { status: true } } },
    });
    if (!membership) throw new NotFoundException('Household shopping list was not found.');
    return membership;
  }

  private async activeMembership(userId: string) {
    const membership = await this.currentMembership(userId);
    if (membership.household.status !== 'active') throw new NotFoundException('Household shopping list was not found.');
    return membership;
  }

  private async requireMembership(
    tx: Prisma.TransactionClient,
    userId: string,
    householdId: string,
    active: boolean,
  ) {
    const membership = await tx.householdMember.findFirst({
      where: { userId, householdId, ...(active ? { household: { status: 'active' } } : {}) },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Household shopping list was not found.');
  }
}

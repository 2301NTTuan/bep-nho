import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FAMILY_MEAL_PLAN_ALGORITHM_VERSION,
  canonicalizeFamilyMealPlanSlots,
  formatIsoCalendarDate,
  isDateInMealPlanWeek,
  parseIsoCalendarDate,
  selectFamilyMealPlanRecipes,
  validateMondayWeekStart,
  type FamilyMealPlanSlot,
} from '@bep-nho/domain';
import { RecipePublishLockService } from '../admin/recipe-publish-lock.service';
import { HouseholdLockService } from '../database/household-lock.service';
import { PrismaService } from '../database/prisma.service';
import type { HouseholdMealPlanSuggestionSlotDto } from './dto/meal-plan.dto';
import { FamilyPersonalizationService, type LockedFamilyVersionResult } from './family-personalization.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MESSAGE = 'Meal plan suggestion is stale. Preview again before applying.';

type SelectionState = Awaited<ReturnType<MealPlanSuggestionService['computeSelectionState']>>;

@Injectable()
export class MealPlanSuggestionService {
  private readonly logger = new Logger(MealPlanSuggestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipeLock: RecipePublishLockService,
    private readonly householdLock: HouseholdLockService,
    private readonly familyPersonalization: FamilyPersonalizationService,
  ) {}

  async preview(userId: string, rawWeekStart: string, rawSlots: HouseholdMealPlanSuggestionSlotDto[]) {
    const weekStart = this.weekStart(rawWeekStart);
    const slots = this.slots(rawWeekStart, rawSlots);
    const membership = await this.activeMembership(userId);
    const state = await this.prisma.$transaction((tx) =>
      this.computeSelectionState(tx, membership.householdId, weekStart, rawWeekStart, slots));
    const familyVersions = await this.generatePreviewVersions(userId, state);
    const preview = this.buildPreview(membership.householdId, rawWeekStart, state, familyVersions);
    this.logger.log('Meal plan event: meal_plan_suggestion_previewed');
    return { data: preview };
  }

  async apply(
    userId: string,
    rawWeekStart: string,
    rawSlots: HouseholdMealPlanSuggestionSlotDto[],
    expectedSuggestionHash: string,
  ) {
    const weekStart = this.weekStart(rawWeekStart);
    const slots = this.slots(rawWeekStart, rawSlots);
    const membership = await this.activeMembership(userId);
    let discovered: SelectionState;
    try {
      discovered = await this.prisma.$transaction((tx) =>
        this.computeSelectionState(tx, membership.householdId, weekStart, rawWeekStart, slots));
    } catch (error) {
      if (error instanceof ConflictException) this.logStale();
      throw error;
    }
    const recipeIds = [...new Set(discovered.selections.map((selection) => selection.recipeId))].sort();
    try {
      const applied = await this.prisma.$transaction(async (tx) => {
        // Global order for multi-recipe work: sorted recipe locks, household lock, then plan mutation.
        for (const recipeId of recipeIds) {
          await this.recipeLock.acquire(tx, recipeId, 'meal_plan_suggestion_apply');
        }
        await this.householdLock.acquire(tx, membership.householdId, 'meal_plan_suggestion_apply');
        await this.requireActiveMembership(tx, userId, membership.householdId);
        const state = await this.computeSelectionState(
          tx, membership.householdId, weekStart, rawWeekStart, slots,
        );
        const recomputedRecipeIds = [...new Set(state.selections.map((selection) => selection.recipeId))].sort();
        if (JSON.stringify(recomputedRecipeIds) !== JSON.stringify(recipeIds)) this.stale();
        const familyVersions = new Map<string, LockedFamilyVersionResult>();
        for (const recipeId of recipeIds) {
          familyVersions.set(
            recipeId,
            await this.familyPersonalization.createForLockedRecipe(tx, membership.householdId, recipeId),
          );
        }
        const preview = this.buildPreview(membership.householdId, rawWeekStart, state, familyVersions);
        if (preview.suggestionHash !== expectedSuggestionHash) this.stale();
        const result = await tx.householdMealPlanEntry.createMany({
          data: state.selections.map((selection) => {
            const family = familyVersions.get(selection.recipeId)!;
            return {
              mealPlanId: state.planId,
              plannedDate: parseIsoCalendarDate(selection.plannedDate),
              mealType: selection.mealType,
              sortOrder: 0,
              recipeId: selection.recipeId,
              recipeVersionId: null,
              householdPersonalizedRecipeVersionId: family.version.id,
              servings: family.servings,
              note: null,
              createdByUserId: userId,
            };
          }),
        });
        if (result.count !== slots.length) this.stale();
        return { ...preview, appliedEntryCount: result.count };
      }, { timeout: 20_000 });
      this.logger.log('Meal plan event: meal_plan_suggestion_applied');
      return { data: applied };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') this.stale();
      throw error;
    }
  }

  private async generatePreviewVersions(userId: string, state: SelectionState) {
    const versions = new Map<string, LockedFamilyVersionResult>();
    const recipeIds = [...new Set(state.selections.map((selection) => selection.recipeId))].sort();
    for (const recipeId of recipeIds) {
      versions.set(recipeId, await this.familyPersonalization.createByRecipeId(userId, recipeId));
    }
    return versions;
  }

  private async computeSelectionState(
    tx: Prisma.TransactionClient,
    householdId: string,
    weekStart: Date,
    rawWeekStart: string,
    slots: FamilyMealPlanSlot[],
  ) {
    const plan = await tx.householdMealPlan.findUnique({
      where: { householdId_weekStart: { householdId, weekStart } },
      include: { entries: { select: { plannedDate: true, mealType: true, recipeId: true } } },
    });
    if (!plan) throw new NotFoundException('Household meal plan was not found.');
    const occupied = new Set(plan.entries.map((entry) => `${formatIsoCalendarDate(entry.plannedDate)}|${entry.mealType}`));
    if (slots.some((slot) => occupied.has(`${slot.plannedDate}|${slot.mealType}`))) {
      throw new ConflictException('A requested meal-plan slot is already occupied.');
    }
    const recipes = await tx.recipe.findMany({
      where: { status: 'published' },
      select: {
        id: true,
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: [{ versionNo: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true, versionNo: true },
        },
      },
    });
    const available = recipes.filter((recipe) => recipe.versions.length === 1);
    if (available.length === 0) throw new ConflictException('No published recipe candidates are available.');
    const historyStart = new Date(weekStart.getTime() - (28 * DAY_MS));
    const recentEntries = await tx.householdMealPlanEntry.findMany({
      where: {
        mealPlan: { householdId, weekStart: { gte: historyStart, lt: weekStart } },
      },
      select: { recipeId: true },
    });
    const recentCounts = new Map<string, number>();
    for (const entry of recentEntries) recentCounts.set(entry.recipeId, (recentCounts.get(entry.recipeId) ?? 0) + 1);
    const candidates = available.map((recipe) => ({
      recipeId: recipe.id,
      baseVersionId: recipe.versions[0].id,
      baseVersionNo: recipe.versions[0].versionNo,
      recentUseCount: recentCounts.get(recipe.id) ?? 0,
    })).sort((left, right) => left.recipeId.localeCompare(right.recipeId));
    const currentWeekEntries = plan.entries.map((entry) => ({
      plannedDate: formatIsoCalendarDate(entry.plannedDate), recipeId: entry.recipeId,
    }));
    const selections = selectFamilyMealPlanRecipes({
      householdId,
      weekStart: rawWeekStart,
      slots,
      candidates,
      currentWeekEntries,
      tieBreak: (slot, recipeId) => this.tieBreak(householdId, rawWeekStart, slot, recipeId),
    });
    const currentPlanState = plan.entries.map((entry) => ({
      plannedDate: formatIsoCalendarDate(entry.plannedDate), mealType: entry.mealType, recipeId: entry.recipeId,
    })).sort((left, right) => (
      left.plannedDate.localeCompare(right.plannedDate)
      || left.mealType.localeCompare(right.mealType)
      || left.recipeId.localeCompare(right.recipeId)
    ));
    return { planId: plan.id, selections, candidates, currentPlanState };
  }

  private buildPreview(
    householdId: string,
    weekStart: string,
    state: SelectionState,
    familyVersions: Map<string, LockedFamilyVersionResult>,
  ) {
    const slots = state.selections.map((selection) => {
      const family = familyVersions.get(selection.recipeId);
      if (!family) throw new ConflictException('Suggested recipe is no longer available.');
      return {
        plannedDate: selection.plannedDate,
        mealType: selection.mealType,
        recipe: family.recipe,
        householdPersonalizedRecipeVersion: {
          id: family.version.id,
          versionNo: family.version.versionNo,
          algorithmVersion: family.version.algorithmVersion,
        },
        reason: {
          recentUseCount: selection.recentUseCount,
          alreadyUsedThisWeek: selection.alreadyUsedThisWeek,
          deterministicTieBreak: selection.deterministicTieBreak,
        },
      };
    });
    const hashAssumptions = {
      algorithmVersion: FAMILY_MEAL_PLAN_ALGORITHM_VERSION,
      householdId,
      weekStart,
      requestedSlots: state.selections.map(({ plannedDate, mealType }) => ({ plannedDate, mealType })),
      currentPlanState: state.currentPlanState,
      candidates: state.candidates,
      selections: state.selections.map((selection) => {
        const family = familyVersions.get(selection.recipeId)!;
        return {
          plannedDate: selection.plannedDate,
          mealType: selection.mealType,
          recipeId: selection.recipeId,
          baseRecipeVersionId: family.baseVersion.id,
          householdPersonalizedRecipeVersionId: family.version.id,
        };
      }),
    };
    const suggestionHash = createHash('sha256').update(JSON.stringify(hashAssumptions)).digest('hex');
    return {
      algorithmVersion: FAMILY_MEAL_PLAN_ALGORITHM_VERSION,
      weekStart,
      suggestionHash,
      familyTaste: familyVersions.values().next().value?.currentFamilyTaste ?? null,
      slots,
    };
  }

  private tieBreak(householdId: string, weekStart: string, slot: FamilyMealPlanSlot, recipeId: string) {
    return createHash('sha256').update([
      FAMILY_MEAL_PLAN_ALGORITHM_VERSION, householdId, weekStart,
      slot.plannedDate, slot.mealType, recipeId,
    ].join('|')).digest('hex');
  }

  private weekStart(value: string) {
    try {
      return validateMondayWeekStart(value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid weekStart.');
    }
  }

  private slots(weekStart: string, rawSlots: HouseholdMealPlanSuggestionSlotDto[]): FamilyMealPlanSlot[] {
    const seen = new Set<string>();
    const slots = canonicalizeFamilyMealPlanSlots(rawSlots);
    for (const slot of slots) {
      try {
        if (!isDateInMealPlanWeek(weekStart, slot.plannedDate)) {
          throw new Error('Every requested slot must fall inside the requested meal-plan week.');
        }
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Invalid suggestion slot.');
      }
      const key = `${slot.plannedDate}|${slot.mealType}`;
      if (seen.has(key)) throw new BadRequestException('Duplicate requested meal-plan slot.');
      seen.add(key);
    }
    return slots;
  }

  private async activeMembership(userId: string) {
    const membership = await this.prisma.householdMember.findUnique({ where: { userId }, include: { household: true } });
    if (!membership || membership.household.status !== 'active') {
      throw new NotFoundException('Household meal plan was not found.');
    }
    return membership;
  }

  private async requireActiveMembership(tx: Prisma.TransactionClient, userId: string, householdId: string) {
    const membership = await tx.householdMember.findFirst({
      where: { userId, householdId, household: { status: 'active' } }, select: { id: true },
    });
    if (!membership) throw new NotFoundException('Household meal plan was not found.');
  }

  private stale(): never {
    this.logStale();
    throw new ConflictException(STALE_MESSAGE);
  }

  private logStale() {
    this.logger.warn('Meal plan event: meal_plan_suggestion_stale');
  }
}

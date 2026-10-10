import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  formatIsoCalendarDate,
  isDateInMealPlanWeek,
  parseIsoCalendarDate,
  validateMondayWeekStart,
} from '@bep-nho/domain';
import { RecipePublishLockService } from '../admin/recipe-publish-lock.service';
import { HouseholdLockService, type HouseholdLockOperation } from '../database/household-lock.service';
import { PrismaService } from '../database/prisma.service';
import type { UpsertHouseholdMealPlanEntryDto } from './dto/meal-plan.dto';

const mealPlanInclude = Prisma.validator<Prisma.HouseholdMealPlanInclude>()({
  entries: {
    orderBy: [
      { plannedDate: 'asc' },
      { mealType: 'asc' },
      { sortOrder: 'asc' },
      { id: 'asc' },
    ],
    include: {
      recipe: { select: { id: true, slug: true, canonicalTitle: true, status: true } },
      recipeVersion: { select: { id: true, versionNo: true } },
      householdPersonalizedRecipeVersion: { select: { id: true, versionNo: true, algorithmVersion: true } },
    },
  },
});

type MealPlanWithEntries = Prisma.HouseholdMealPlanGetPayload<{ include: typeof mealPlanInclude }>;

@Injectable()
export class MealPlanService {
  private readonly logger = new Logger(MealPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly householdLock: HouseholdLockService,
    private readonly recipeLock: RecipePublishLockService,
  ) {}

  async get(userId: string, rawWeekStart: string) {
    const weekStart = this.weekStart(rawWeekStart);
    const member = await this.currentMembership(userId);
    const plan = await this.prisma.householdMealPlan.findUnique({
      where: { householdId_weekStart: { householdId: member.householdId, weekStart } },
      include: mealPlanInclude,
    });
    if (!plan) throw new NotFoundException('Household meal plan was not found.');
    return { data: this.serialize(plan) };
  }

  async create(userId: string, rawWeekStart: string) {
    const weekStart = this.weekStart(rawWeekStart);
    const discovered = await this.activeMembership(userId);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.householdLock.acquire(tx, discovered.householdId, 'meal_plan_create');
      await this.requireActiveMembership(tx, userId, discovered.householdId);
      const existing = await tx.householdMealPlan.findUnique({
        where: { householdId_weekStart: { householdId: discovered.householdId, weekStart } },
        include: mealPlanInclude,
      });
      if (existing) return { plan: existing, reused: true };
      const plan = await tx.householdMealPlan.create({
        data: { householdId: discovered.householdId, weekStart, createdByUserId: userId },
        include: mealPlanInclude,
      });
      return { plan, reused: false };
    });
    if (!result.reused) this.logger.log('Meal plan event: meal_plan_created');
    return { data: { ...this.serialize(result.plan), reused: result.reused } };
  }

  async createEntry(userId: string, rawWeekStart: string, dto: UpsertHouseholdMealPlanEntryDto) {
    const weekStart = this.weekStart(rawWeekStart);
    this.validatePlannedDate(rawWeekStart, dto.plannedDate);
    const member = await this.activeMembership(userId);
    const source = await this.discoverSource(dto, member.householdId);
    try {
      const entryId = await this.prisma.$transaction(async (tx) => {
        // Global order: recipe publication/status, then household, then the plan row.
        await this.recipeLock.acquire(tx, source.recipeId, 'meal_plan_entry');
        await this.householdLock.acquire(tx, member.householdId, 'meal_plan_entry_create');
        await this.requireActiveMembership(tx, userId, member.householdId);
        const plan = await this.requirePlan(tx, member.householdId, weekStart);
        const validated = await this.validateSource(tx, dto, member.householdId, true);
        await this.requireAvailableSlot(tx, plan.id, dto.plannedDate, dto.mealType);
        const entry = await tx.householdMealPlanEntry.create({
          data: {
            mealPlanId: plan.id,
            plannedDate: parseIsoCalendarDate(dto.plannedDate),
            mealType: dto.mealType,
            sortOrder: dto.sortOrder,
            recipeId: validated.recipeId,
            recipeVersionId: validated.recipeVersionId,
            householdPersonalizedRecipeVersionId: validated.householdVersionId,
            servings: dto.servings,
            note: dto.note?.trim() || null,
            createdByUserId: userId,
          },
        });
        return entry.id;
      });
      this.logger.log('Meal plan event: meal_plan_entry_created');
      return this.entryResponse(member.householdId, weekStart, entryId);
    } catch (error) {
      this.translateConstraint(error);
    }
  }

  async updateEntry(
    userId: string,
    rawWeekStart: string,
    entryId: string,
    dto: UpsertHouseholdMealPlanEntryDto,
  ) {
    const weekStart = this.weekStart(rawWeekStart);
    this.validatePlannedDate(rawWeekStart, dto.plannedDate);
    const member = await this.activeMembership(userId);
    const source = await this.discoverSource(dto, member.householdId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.recipeLock.acquire(tx, source.recipeId, 'meal_plan_entry');
        await this.householdLock.acquire(tx, member.householdId, 'meal_plan_entry_update');
        await this.requireActiveMembership(tx, userId, member.householdId);
        const plan = await this.requirePlan(tx, member.householdId, weekStart);
        const current = await tx.householdMealPlanEntry.findFirst({ where: { id: entryId, mealPlanId: plan.id } });
        if (!current) throw new NotFoundException('Household meal plan entry was not found.');
        const sourceChanged = current.recipeVersionId !== (dto.recipeVersionId ?? null)
          || current.householdPersonalizedRecipeVersionId !== (dto.householdPersonalizedRecipeVersionId ?? null);
        const validated = await this.validateSource(tx, dto, member.householdId, sourceChanged);
        await this.requireAvailableSlot(tx, plan.id, dto.plannedDate, dto.mealType, entryId);
        await tx.householdMealPlanEntry.update({
          where: { id: entryId },
          data: {
            plannedDate: parseIsoCalendarDate(dto.plannedDate),
            mealType: dto.mealType,
            sortOrder: dto.sortOrder,
            recipeId: validated.recipeId,
            recipeVersionId: validated.recipeVersionId,
            householdPersonalizedRecipeVersionId: validated.householdVersionId,
            servings: dto.servings,
            note: dto.note?.trim() || null,
          },
        });
      });
      this.logger.log('Meal plan event: meal_plan_entry_updated');
      return this.entryResponse(member.householdId, weekStart, entryId);
    } catch (error) {
      this.translateConstraint(error);
    }
  }

  async deleteEntry(userId: string, rawWeekStart: string, entryId: string) {
    const weekStart = this.weekStart(rawWeekStart);
    const member = await this.activeMembership(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.householdLock.acquire(tx, member.householdId, 'meal_plan_entry_delete');
      await this.requireActiveMembership(tx, userId, member.householdId);
      const plan = await this.requirePlan(tx, member.householdId, weekStart);
      const deleted = await tx.householdMealPlanEntry.deleteMany({ where: { id: entryId, mealPlanId: plan.id } });
      if (deleted.count !== 1) throw new NotFoundException('Household meal plan entry was not found.');
    });
    this.logger.log('Meal plan event: meal_plan_entry_deleted');
    return { data: { deleted: true } };
  }

  private async currentMembership(userId: string) {
    const member = await this.prisma.householdMember.findUnique({
      where: { userId },
      include: { household: true },
    });
    if (!member) throw new NotFoundException('Household meal plan was not found.');
    return member;
  }

  private async activeMembership(userId: string) {
    const member = await this.currentMembership(userId);
    if (member.household.status !== 'active') throw new NotFoundException('Household meal plan was not found.');
    return member;
  }

  private async requireActiveMembership(tx: Prisma.TransactionClient, userId: string, householdId: string) {
    const member = await tx.householdMember.findFirst({
      where: { userId, householdId, household: { status: 'active' } },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Household meal plan was not found.');
  }

  private async requirePlan(tx: Prisma.TransactionClient, householdId: string, weekStart: Date) {
    const plan = await tx.householdMealPlan.findUnique({
      where: { householdId_weekStart: { householdId, weekStart } },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('Household meal plan was not found.');
    return plan;
  }

  private weekStart(value: string): Date {
    try {
      return validateMondayWeekStart(value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid weekStart.');
    }
  }

  private validatePlannedDate(weekStart: string, plannedDate: string) {
    try {
      if (!isDateInMealPlanWeek(weekStart, plannedDate)) {
        throw new Error('plannedDate must fall inside the requested meal plan week.');
      }
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid plannedDate.');
    }
  }

  private sourceIds(dto: UpsertHouseholdMealPlanEntryDto) {
    const recipeVersionId = dto.recipeVersionId ?? null;
    const householdVersionId = dto.householdPersonalizedRecipeVersionId ?? null;
    if ((recipeVersionId === null) === (householdVersionId === null)) {
      throw new BadRequestException('Select exactly one canonical or household recipe version.');
    }
    return { recipeVersionId, householdVersionId };
  }

  private async discoverSource(dto: UpsertHouseholdMealPlanEntryDto, householdId: string) {
    const ids = this.sourceIds(dto);
    if (ids.recipeVersionId) {
      const version = await this.prisma.recipeVersion.findUnique({
        where: { id: ids.recipeVersionId }, select: { recipeId: true },
      });
      if (!version) throw new NotFoundException('Recipe version was not found.');
      return { recipeId: version.recipeId };
    }
    const version = await this.prisma.householdPersonalizedRecipeVersion.findFirst({
      where: { id: ids.householdVersionId!, householdId }, select: { recipeId: true },
    });
    if (!version) throw new NotFoundException('Household recipe version was not found.');
    return { recipeId: version.recipeId };
  }

  private async validateSource(
    tx: Prisma.TransactionClient,
    dto: UpsertHouseholdMealPlanEntryDto,
    householdId: string,
    requirePublished: boolean,
  ) {
    const ids = this.sourceIds(dto);
    if (ids.recipeVersionId) {
      const version = await tx.recipeVersion.findUnique({
        where: { id: ids.recipeVersionId },
        select: { id: true, recipeId: true, publishedAt: true, recipe: { select: { status: true } } },
      });
      if (!version || version.publishedAt === null) throw new NotFoundException('Recipe version was not found.');
      if (requirePublished && version.recipe.status !== 'published') {
        throw new ConflictException('Recipe is not currently published.');
      }
      return { recipeId: version.recipeId, recipeVersionId: version.id, householdVersionId: null };
    }
    const version = await tx.householdPersonalizedRecipeVersion.findFirst({
      where: { id: ids.householdVersionId!, householdId },
      select: { id: true, recipeId: true, recipe: { select: { status: true } } },
    });
    if (!version) throw new NotFoundException('Household recipe version was not found.');
    if (requirePublished && version.recipe.status !== 'published') {
      throw new ConflictException('Recipe is not currently published.');
    }
    return { recipeId: version.recipeId, recipeVersionId: null, householdVersionId: version.id };
  }

  private async requireAvailableSlot(
    tx: Prisma.TransactionClient,
    mealPlanId: string,
    plannedDate: string,
    mealType: string,
    excludeEntryId?: string,
  ) {
    if (mealType === 'other') return;
    const conflict = await tx.householdMealPlanEntry.findFirst({
      where: {
        mealPlanId,
        plannedDate: parseIsoCalendarDate(plannedDate),
        mealType,
        ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) throw new ConflictException('The meal slot already has an entry.');
  }

  private async entryResponse(householdId: string, weekStart: Date, entryId: string) {
    const plan = await this.prisma.householdMealPlan.findUniqueOrThrow({
      where: { householdId_weekStart: { householdId, weekStart } }, include: mealPlanInclude,
    });
    const entry = this.serialize(plan).entries.find((item) => item.id === entryId);
    if (!entry) throw new NotFoundException('Household meal plan entry was not found.');
    return { data: entry };
  }

  private serialize(plan: MealPlanWithEntries) {
    return {
      id: plan.id,
      weekStart: formatIsoCalendarDate(plan.weekStart),
      createdByUserId: plan.createdByUserId,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      entries: plan.entries.map((entry) => ({
        id: entry.id,
        plannedDate: formatIsoCalendarDate(entry.plannedDate),
        mealType: entry.mealType,
        sortOrder: entry.sortOrder,
        recipe: {
          id: entry.recipe.id,
          slug: entry.recipe.slug,
          title: entry.recipe.canonicalTitle,
          status: entry.recipe.status,
        },
        recipeVersion: entry.recipeVersion,
        householdPersonalizedRecipeVersion: entry.householdPersonalizedRecipeVersion,
        servings: entry.servings,
        note: entry.note,
        createdByUserId: entry.createdByUserId,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    };
  }

  private translateConstraint(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('The meal slot already has an entry.');
    }
    throw error;
  }
}

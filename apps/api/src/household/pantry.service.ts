import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatIsoCalendarDate, parseIsoCalendarDate } from '@bep-nho/domain';
import { HouseholdLockService } from '../database/household-lock.service';
import { PrismaService } from '../database/prisma.service';
import type { CreateHouseholdPantryItemDto, UpdateHouseholdPantryItemDto } from './dto/pantry.dto';

const pantryItemInclude = Prisma.validator<Prisma.HouseholdPantryItemInclude>()({
  ingredient: { select: { id: true, slug: true, canonicalName: true, category: true } },
});

type PantryItem = Prisma.HouseholdPantryItemGetPayload<{ include: typeof pantryItemInclude }>;

@Injectable()
export class PantryService {
  private readonly logger = new Logger(PantryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly householdLock: HouseholdLockService,
  ) {}

  async list(userId: string) {
    const membership = await this.currentMembership(userId);
    const items = await this.prisma.householdPantryItem.findMany({
      where: { householdId: membership.householdId },
      include: pantryItemInclude,
      orderBy: [{ ingredient: { canonicalName: 'asc' } }, { id: 'asc' }],
    });
    return { data: items.map((item) => this.serialize(item)) };
  }

  async create(userId: string, dto: CreateHouseholdPantryItemDto) {
    const membership = await this.activeMembership(userId);
    const bestBeforeDate = this.date(dto.bestBeforeDate);
    try {
      const item = await this.prisma.$transaction(async (tx) => {
        await this.householdLock.acquire(tx, membership.householdId, 'pantry_item_create');
        await this.requireActiveMembership(tx, userId, membership.householdId);
        const ingredient = await tx.ingredient.findUnique({
          where: { id: dto.ingredientId },
          select: { id: true },
        });
        if (!ingredient) throw new NotFoundException('Ingredient was not found.');
        const existing = await tx.householdPantryItem.findUnique({
          where: {
            householdId_ingredientId: {
              householdId: membership.householdId,
              ingredientId: dto.ingredientId,
            },
          },
          select: { id: true },
        });
        if (existing) throw new ConflictException('This ingredient is already in the household pantry.');
        return tx.householdPantryItem.create({
          data: {
            householdId: membership.householdId,
            ingredientId: dto.ingredientId,
            quantity: dto.quantity,
            unit: dto.unit.trim(),
            bestBeforeDate,
            note: this.note(dto.note),
            createdByUserId: userId,
            updatedByUserId: userId,
          },
          include: pantryItemInclude,
        });
      });
      this.logger.log('Pantry event: pantry_item_created');
      return { data: this.serialize(item) };
    } catch (error) {
      if (error instanceof ConflictException) this.logger.warn('Pantry event: pantry_item_conflict');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.warn('Pantry event: pantry_item_conflict');
        throw new ConflictException('This ingredient is already in the household pantry.');
      }
      throw error;
    }
  }

  async update(userId: string, itemId: string, dto: UpdateHouseholdPantryItemDto) {
    const membership = await this.activeMembership(userId);
    const bestBeforeDate = this.date(dto.bestBeforeDate);
    const item = await this.prisma.$transaction(async (tx) => {
      await this.householdLock.acquire(tx, membership.householdId, 'pantry_item_update');
      await this.requireActiveMembership(tx, userId, membership.householdId);
      const current = await tx.householdPantryItem.findFirst({
        where: { id: itemId, householdId: membership.householdId },
        select: { id: true },
      });
      if (!current) throw new NotFoundException('Pantry item was not found.');
      const updated = await tx.householdPantryItem.updateMany({
        where: { id: itemId, householdId: membership.householdId, revision: dto.expectedRevision },
        data: {
          quantity: dto.quantity,
          unit: dto.unit.trim(),
          bestBeforeDate,
          note: this.note(dto.note),
          revision: { increment: 1 },
          updatedByUserId: userId,
        },
      });
      if (updated.count !== 1) throw new ConflictException('Pantry item revision is stale. Reload before editing.');
      return tx.householdPantryItem.findUniqueOrThrow({ where: { id: itemId }, include: pantryItemInclude });
    }).catch((error: unknown) => {
      if (error instanceof ConflictException) this.logger.warn('Pantry event: pantry_item_conflict');
      throw error;
    });
    this.logger.log('Pantry event: pantry_item_updated');
    return { data: this.serialize(item) };
  }

  async delete(userId: string, itemId: string, expectedRevision: number) {
    const membership = await this.activeMembership(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.householdLock.acquire(tx, membership.householdId, 'pantry_item_delete');
      await this.requireActiveMembership(tx, userId, membership.householdId);
      const current = await tx.householdPantryItem.findFirst({
        where: { id: itemId, householdId: membership.householdId },
        select: { id: true },
      });
      if (!current) throw new NotFoundException('Pantry item was not found.');
      const deleted = await tx.householdPantryItem.deleteMany({
        where: { id: itemId, householdId: membership.householdId, revision: expectedRevision },
      });
      if (deleted.count !== 1) throw new ConflictException('Pantry item revision is stale. Reload before deleting.');
    }).catch((error: unknown) => {
      if (error instanceof ConflictException) this.logger.warn('Pantry event: pantry_item_conflict');
      throw error;
    });
    this.logger.log('Pantry event: pantry_item_deleted');
    return { data: { deleted: true } };
  }

  private async currentMembership(userId: string) {
    const membership = await this.prisma.householdMember.findUnique({
      where: { userId },
      select: { householdId: true, household: { select: { status: true } } },
    });
    if (!membership) throw new NotFoundException('Household pantry was not found.');
    return membership;
  }

  private async activeMembership(userId: string) {
    const membership = await this.currentMembership(userId);
    if (membership.household.status !== 'active') throw new NotFoundException('Household pantry was not found.');
    return membership;
  }

  private async requireActiveMembership(tx: Prisma.TransactionClient, userId: string, householdId: string) {
    const membership = await tx.householdMember.findFirst({
      where: { userId, householdId, household: { status: 'active' } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Household pantry was not found.');
  }

  private date(value: string | null | undefined): Date | null {
    if (value == null) return null;
    try {
      return parseIsoCalendarDate(value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid bestBeforeDate.');
    }
  }

  private note(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private serialize(item: PantryItem) {
    return {
      id: item.id,
      revision: item.revision,
      ingredient: {
        id: item.ingredient.id,
        slug: item.ingredient.slug,
        name: item.ingredient.canonicalName,
        category: item.ingredient.category,
      },
      quantity: item.quantity.toNumber(),
      unit: item.unit,
      bestBeforeDate: item.bestBeforeDate ? formatIsoCalendarDate(item.bestBeforeDate) : null,
      note: item.note,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

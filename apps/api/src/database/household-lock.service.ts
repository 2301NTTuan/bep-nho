import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type HouseholdLockOperation =
  | 'invite_accept'
  | 'member_remove'
  | 'member_leave'
  | 'account_delete'
  | 'family_version'
  | 'meal_plan_create'
  | 'meal_plan_entry_create'
  | 'meal_plan_entry_update'
  | 'meal_plan_entry_delete'
  | 'meal_plan_suggestion_apply'
  | 'pantry_item_create'
  | 'pantry_item_update'
  | 'pantry_item_delete';

@Injectable()
export class HouseholdLockService {
  async acquire(
    tx: Prisma.TransactionClient,
    householdId: string,
    _operation: HouseholdLockOperation,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`household:${householdId}`}, 0))`;
  }
}

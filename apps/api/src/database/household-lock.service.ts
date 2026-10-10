import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type HouseholdLockOperation = 'invite_accept' | 'member_remove' | 'member_leave' | 'account_delete' | 'family_version';

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

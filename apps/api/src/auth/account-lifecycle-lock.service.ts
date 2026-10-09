import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type AccountLifecycleLockOperation =
  | 'register'
  | 'login'
  | 'establish_session'
  | 'email_verification_request'
  | 'email_verification_confirm'
  | 'password_reset_request'
  | 'password_reset_confirm'
  | 'password_change'
  | 'account_delete';

export type AccountLifecycleLockPhase = 'before_acquire' | 'acquired';

type LockHook = (
  phase: AccountLifecycleLockPhase,
  operation: AccountLifecycleLockOperation,
  userId: string,
) => Promise<void> | void;

@Injectable()
export class AccountLifecycleLockService {
  private testHook: LockHook | null = null;

  async acquire(
    tx: Prisma.TransactionClient,
    userId: string,
    operation: AccountLifecycleLockOperation,
  ): Promise<void> {
    await this.testHook?.('before_acquire', operation, userId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-lifecycle:${userId}`}))`;
    await this.testHook?.('acquired', operation, userId);
  }

  setTestHook(hook: LockHook | null): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Account lifecycle test hooks are only available in tests.');
    }
    this.testHook = hook;
  }
}

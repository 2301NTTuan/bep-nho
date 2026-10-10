import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type RecipePublishOperation = 'publish' | 'archive' | 'restore' | 'meal_plan_entry';
export type RecipePublishLockPhase = 'before_acquire' | 'acquired';
type TestHook = (phase: RecipePublishLockPhase, operation: RecipePublishOperation, recipeId: string) => Promise<void> | void;

@Injectable()
export class RecipePublishLockService {
  private testHook: TestHook | null = null;

  async acquire(tx: Prisma.TransactionClient, recipeId: string, operation: RecipePublishOperation) {
    await this.testHook?.('before_acquire', operation, recipeId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe-publish:${recipeId}`}, 0))`;
    await this.testHook?.('acquired', operation, recipeId);
  }

  setTestHook(hook: TestHook | null) {
    if (process.env.NODE_ENV !== 'test') throw new Error('Recipe publish test hooks are only available in tests.');
    this.testHook = hook;
  }
}

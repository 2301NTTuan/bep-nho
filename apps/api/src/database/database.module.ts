import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { HouseholdLockService } from './household-lock.service';

@Global()
@Module({
  providers: [PrismaService, HouseholdLockService],
  exports: [PrismaService, HouseholdLockService],
})
export class DatabaseModule {}

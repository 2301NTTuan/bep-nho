import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HouseholdController, HouseholdInviteController } from './household.controller';
import { HouseholdService } from './household.service';
import { FamilyPersonalizationService } from './family-personalization.service';

@Module({
  imports: [AuthModule],
  controllers: [HouseholdController, HouseholdInviteController],
  providers: [HouseholdService, FamilyPersonalizationService],
  exports: [HouseholdService, FamilyPersonalizationService],
})
export class HouseholdModule {}

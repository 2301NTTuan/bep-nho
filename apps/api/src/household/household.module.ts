import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { HouseholdController, HouseholdInviteController } from './household.controller';
import { HouseholdService } from './household.service';
import { FamilyPersonalizationService } from './family-personalization.service';
import { MealPlanController } from './meal-plan.controller';
import { MealPlanService } from './meal-plan.service';
import { MealPlanSuggestionService } from './meal-plan-suggestion.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [HouseholdController, HouseholdInviteController, MealPlanController],
  providers: [HouseholdService, FamilyPersonalizationService, MealPlanService, MealPlanSuggestionService],
  exports: [HouseholdService, FamilyPersonalizationService, MealPlanService, MealPlanSuggestionService],
})
export class HouseholdModule {}

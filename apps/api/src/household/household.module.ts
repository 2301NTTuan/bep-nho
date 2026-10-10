import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { HouseholdController, HouseholdInviteController } from './household.controller';
import { HouseholdService } from './household.service';
import { FamilyPersonalizationService } from './family-personalization.service';
import { MealPlanController } from './meal-plan.controller';
import { MealPlanService } from './meal-plan.service';
import { MealPlanSuggestionService } from './meal-plan-suggestion.service';
import { PantryController } from './pantry.controller';
import { PantryService } from './pantry.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [HouseholdController, HouseholdInviteController, MealPlanController, PantryController],
  providers: [HouseholdService, FamilyPersonalizationService, MealPlanService, MealPlanSuggestionService, PantryService],
  exports: [HouseholdService, FamilyPersonalizationService, MealPlanService, MealPlanSuggestionService, PantryService],
})
export class HouseholdModule {}

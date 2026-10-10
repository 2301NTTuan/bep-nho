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
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [HouseholdController, HouseholdInviteController, MealPlanController, PantryController, ShoppingListController],
  providers: [HouseholdService, FamilyPersonalizationService, MealPlanService, MealPlanSuggestionService, PantryService, ShoppingListService],
  exports: [HouseholdService, FamilyPersonalizationService, MealPlanService, MealPlanSuggestionService, PantryService, ShoppingListService],
})
export class HouseholdModule {}

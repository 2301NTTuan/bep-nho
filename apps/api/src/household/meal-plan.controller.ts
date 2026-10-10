import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';
import { CreateHouseholdMealPlanDto, UpsertHouseholdMealPlanEntryDto } from './dto/meal-plan.dto';
import { MealPlanService } from './meal-plan.service';

@ApiTags('Household meal plans')
@ApiSessionProtected()
@UseGuards(SessionAuthGuard)
@Controller('me/household/meal-plans')
export class MealPlanController {
  constructor(private readonly mealPlans: MealPlanService) {}

  @Get(':weekStart')
  @ApiOperation({ summary: 'Read the current household meal plan for a Monday-based week.' })
  @ApiParam({ name: 'weekStart', example: '2026-10-12' })
  @ApiResponse({ status: 200, description: 'Household meal plan.' })
  @ApiStandardErrors(400, 401, 404)
  get(@CurrentUser() identity: AuthenticatedIdentity, @Param('weekStart') weekStart: string) {
    return this.mealPlans.get(identity.userId, weekStart);
  }

  @Post()
  @ApiOperation({ summary: 'Create or return the existing meal plan for a week.' })
  @ApiResponse({ status: 201, description: 'Meal plan; reused is true when it already existed.' })
  @ApiStandardErrors(400, 401, 404)
  create(@CurrentUser() identity: AuthenticatedIdentity, @Body() dto: CreateHouseholdMealPlanDto) {
    return this.mealPlans.create(identity.userId, dto.weekStart);
  }

  @Post(':weekStart/entries')
  @ApiOperation({ summary: 'Add an entry to an active household meal plan.' })
  @ApiParam({ name: 'weekStart', example: '2026-10-12' })
  @ApiResponse({ status: 201, description: 'Meal plan entry.' })
  @ApiStandardErrors(400, 401, 404, 409)
  addEntry(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('weekStart') weekStart: string,
    @Body() dto: UpsertHouseholdMealPlanEntryDto,
  ) {
    return this.mealPlans.createEntry(identity.userId, weekStart, dto);
  }

  @Put(':weekStart/entries/:entryId')
  @ApiOperation({ summary: 'Replace the mutable fields of a household meal plan entry.' })
  @ApiParam({ name: 'weekStart', example: '2026-10-12' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated meal plan entry.' })
  @ApiStandardErrors(400, 401, 404, 409)
  updateEntry(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('weekStart') weekStart: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpsertHouseholdMealPlanEntryDto,
  ) {
    return this.mealPlans.updateEntry(identity.userId, weekStart, entryId, dto);
  }

  @Delete(':weekStart/entries/:entryId')
  @ApiOperation({ summary: 'Remove only a household meal plan entry.' })
  @ApiParam({ name: 'weekStart', example: '2026-10-12' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Entry removed.' })
  @ApiStandardErrors(400, 401, 404)
  deleteEntry(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('weekStart') weekStart: string,
    @Param('entryId') entryId: string,
  ) {
    return this.mealPlans.deleteEntry(identity.userId, weekStart, entryId);
  }
}

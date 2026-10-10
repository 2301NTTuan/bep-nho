import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { MEAL_TYPES, type MealType } from '@bep-nho/domain';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateHouseholdMealPlanDto {
  @ApiProperty({ example: '2026-10-12', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsString()
  @Matches(ISO_DATE)
  weekStart!: string;
}

export class UpsertHouseholdMealPlanEntryDto {
  @ApiProperty({ example: '2026-10-12', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsString()
  @Matches(ISO_DATE)
  plannedDate!: string;

  @ApiProperty({ enum: MEAL_TYPES })
  @IsIn(MEAL_TYPES)
  mealType!: MealType;

  @ApiProperty({ minimum: 0, maximum: 10_000, example: 0 })
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder!: number;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Select exactly one recipe source field.' })
  @IsOptional()
  @IsUUID()
  recipeVersionId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Select exactly one recipe source field.' })
  @IsOptional()
  @IsUUID()
  householdPersonalizedRecipeVersionId?: string | null;

  @ApiProperty({ minimum: 1, maximum: 8, example: 4 })
  @IsInt()
  @Min(1)
  @Max(8)
  servings!: number;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MEAL_TYPES, SUGGESTION_MEAL_TYPES, type MealType, type SuggestionMealType } from '@bep-nho/domain';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

export class HouseholdMealPlanSuggestionSlotDto {
  @ApiProperty({ example: '2026-10-12', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsString()
  @Matches(ISO_DATE)
  plannedDate!: string;

  @ApiProperty({ enum: SUGGESTION_MEAL_TYPES, description: 'V1 suggestions support only lunch and dinner.' })
  @IsIn(SUGGESTION_MEAL_TYPES)
  mealType!: SuggestionMealType;
}

export class PreviewHouseholdMealPlanSuggestionsDto {
  @ApiProperty({ type: [HouseholdMealPlanSuggestionSlotDto], minItems: 1, maxItems: 14 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(14)
  @ValidateNested({ each: true })
  @Type(() => HouseholdMealPlanSuggestionSlotDto)
  slots!: HouseholdMealPlanSuggestionSlotDto[];
}

export class ApplyHouseholdMealPlanSuggestionsDto extends PreviewHouseholdMealPlanSuggestionsDto {
  @ApiProperty({
    pattern: '^[a-f0-9]{64}$',
    description: 'Hash returned by preview; apply recomputes all assumptions before one atomic insert.',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedSuggestionHash!: string;
}

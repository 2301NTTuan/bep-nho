import {
  Type,
} from 'class-transformer';

import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class StartCookSessionDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Length(1, 180)
  recipeSlug!: string;

  @IsOptional()
  @IsUUID()
  personalizedRecipeVersionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0.5)
  @Max(50)
  servings?: number;
}

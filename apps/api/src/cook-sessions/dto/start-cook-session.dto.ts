import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class StartCookSessionDto {
  @IsString()
  @Length(1, 180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  recipeSlug!: string;

  @IsOptional()
  @IsUUID()
  personalizedRecipeVersionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  servings?: number;
}

import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class StartCookSessionDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Length(1, 180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  recipeSlug!: string;

  @IsOptional()
  @IsUUID()
  personalizedRecipeVersionId?: string;
}

import { ApiProperty } from '@nestjs/swagger';

class RecipeHeroMediaResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
}

class RecipeListVersionResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Exact latest published canonical version identifier.' }) id!: string;
  @ApiProperty({ minimum: 1 }) versionNo!: number;
  @ApiProperty({ minimum: 1 }) servings!: number;
  @ApiProperty({ nullable: true, type: Number }) prepTimeMinutes!: number | null;
  @ApiProperty({ nullable: true, type: Number }) cookTimeMinutes!: number | null;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time', type: String }) publishedAt!: string | null;
  @ApiProperty({ nullable: true, type: RecipeHeroMediaResponseDto }) heroMedia!: RecipeHeroMediaResponseDto | null;
}

class RecipeListItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() cuisine!: string;
  @ApiProperty({ nullable: true, type: RecipeListVersionResponseDto }) latestVersion!: RecipeListVersionResponseDto | null;
}

class RecipeListMetaResponseDto {
  @ApiProperty({ minimum: 0 }) count!: number;
}

export class RecipeListResponseDto {
  @ApiProperty({ type: [RecipeListItemResponseDto] }) data!: RecipeListItemResponseDto[];
  @ApiProperty({ type: RecipeListMetaResponseDto }) meta!: RecipeListMetaResponseDto;
}

import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUANTITY = 999_999_999.999;

export class CreateHouseholdPantryItemDto {
  @ApiProperty({ format: 'uuid', description: 'Existing canonical Ingredient ID.' })
  @IsUUID()
  ingredientId!: string;

  @ApiProperty({ example: 500, minimum: 0.001, maximum: MAX_QUANTITY, description: 'Absolute current quantity; no unit conversion is performed.' })
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({ example: 'g', minLength: 1, maxLength: 32, description: 'Explicit unit text; preserved after trimming.' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/\S/)
  @MaxLength(32)
  unit!: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2026-10-20', nullable: true, description: 'Calendar DATE in strict YYYY-MM-DD form; past dates are allowed.' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  bestBeforeDate?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class UpdateHouseholdPantryItemDto {
  @ApiProperty({ example: 1, minimum: 1, description: 'Current item revision required for optimistic concurrency.' })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty({ example: 350, minimum: 0.001, maximum: MAX_QUANTITY, description: 'Replacement absolute quantity; no delta or unit conversion.' })
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({ example: 'g', minLength: 1, maxLength: 32 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/\S/)
  @MaxLength(32)
  unit!: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2026-10-20', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  bestBeforeDate?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class DeleteHouseholdPantryItemQueryDto {
  @ApiProperty({ example: 1, minimum: 1, description: 'Current item revision required for optimistic concurrency.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class DiscoverHouseholdPantryIngredientsQueryDto {
  @ApiPropertyOptional({ maxLength: 120, description: 'Simple case-insensitive canonical ingredient-name substring.' })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(120)
  query?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 30;
}

import { Type } from 'class-transformer';

import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsIn,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TECHNICAL_FLAGS } from '@bep-nho/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TasteFeedbackDimensionsDto {
  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  saltiness?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  sweetness?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  sourness?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  spiciness?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  umami?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  fat_richness?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  bitterness?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  softness?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  dryness_sauce?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  garlic_onion?: number;

  @ApiPropertyOptional({ minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  herbal_aroma?: number;
}

export class SubmitFeedbackDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5, multipleOf: 0.1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({
    maxDecimalPlaces: 1,
  })
  @Min(1)
  @Max(5)
  overallScore?: number;

  @ApiProperty({ type: TasteFeedbackDimensionsDto })
  @ValidateNested()
  @Type(
    () =>
      TasteFeedbackDimensionsDto,
  )
  dimensions!: TasteFeedbackDimensionsDto;

  @ApiPropertyOptional({ enum: TECHNICAL_FLAGS, isArray: true, maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({
    each: true,
  })
  @IsIn(TECHNICAL_FLAGS, { each: true })
  technicalFlags?: string[];

  @ApiPropertyOptional({ maxLength: 2000, writeOnly: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNote?: string;
}

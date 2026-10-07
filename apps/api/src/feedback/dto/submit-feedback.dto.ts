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

export class TasteFeedbackDimensionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  saltiness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  sweetness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  sourness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  spiciness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  umami?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  fat_richness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  bitterness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  softness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  dryness_sauce?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  garlic_onion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  herbal_aroma?: number;
}

export class SubmitFeedbackDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({
    maxDecimalPlaces: 1,
  })
  @Min(1)
  @Max(5)
  overallScore?: number;

  @ValidateNested()
  @Type(
    () =>
      TasteFeedbackDimensionsDto,
  )
  dimensions!: TasteFeedbackDimensionsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({
    each: true,
  })
  @IsIn(TECHNICAL_FLAGS, { each: true })
  technicalFlags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNote?: string;
}

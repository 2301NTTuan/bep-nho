import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TASTE_DIMENSION_KEYS } from '@bep-nho/contracts';

export class TasteHistoryQuery {
  @IsOptional()
  @IsIn(TASTE_DIMENSION_KEYS)
  dimension?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @IsOptional()
  @IsString()
  cursor?: string;
}

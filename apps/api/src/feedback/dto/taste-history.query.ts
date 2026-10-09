import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TASTE_DIMENSION_KEYS } from '@bep-nho/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TasteHistoryQuery {
  @ApiPropertyOptional({ enum: TASTE_DIMENSION_KEYS })
  @IsOptional()
  @IsIn(TASTE_DIMENSION_KEYS)
  dimension?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @ApiPropertyOptional({ description: 'Opaque pagination cursor.' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

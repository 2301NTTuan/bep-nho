import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';
import { PERSONALIZED_ADJUSTMENT_ACTIONS, type PersonalizedAdjustmentAction } from '@bep-nho/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewAdjustmentDto {
  @ApiProperty({ enum: PERSONALIZED_ADJUSTMENT_ACTIONS })
  @IsIn(PERSONALIZED_ADJUSTMENT_ACTIONS)
  action!: PersonalizedAdjustmentAction;

  @ApiPropertyOptional({ minimum: 0.001, description: 'Required when action is EDIT.' })
  @ValidateIf((dto: ReviewAdjustmentDto) => dto.action === 'EDIT')
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity?: number;
}

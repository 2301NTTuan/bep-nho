import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';
import { PERSONALIZED_ADJUSTMENT_ACTIONS, type PersonalizedAdjustmentAction } from '@bep-nho/contracts';

export class ReviewAdjustmentDto {
  @IsIn(PERSONALIZED_ADJUSTMENT_ACTIONS)
  action!: PersonalizedAdjustmentAction;

  @ValidateIf((dto: ReviewAdjustmentDto) => dto.action === 'EDIT')
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity?: number;
}

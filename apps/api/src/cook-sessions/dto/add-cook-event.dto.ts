import {
  IsISO8601,
  IsInt,
  IsIn,
  IsObject,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { COOK_EVENT_TYPES } from '@bep-nho/contracts';

export class AddCookEventDto {
  @IsString()
  @IsIn(COOK_EVENT_TYPES)
  eventType!: string;

  @IsInt()
  @Min(1)
  clientSeq!: number;

  @IsISO8601()
  clientTime!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

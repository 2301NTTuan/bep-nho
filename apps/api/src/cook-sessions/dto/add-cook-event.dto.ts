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
import { ApiProperty } from '@nestjs/swagger';

export class AddCookEventDto {
  @ApiProperty({ enum: COOK_EVENT_TYPES })
  @IsString()
  @IsIn(COOK_EVENT_TYPES)
  eventType!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  clientSeq!: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  clientTime!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  payload!: Record<string, unknown>;
}

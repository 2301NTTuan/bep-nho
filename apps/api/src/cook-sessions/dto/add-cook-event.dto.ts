import {
  IsISO8601,
  IsInt,
  IsObject,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class AddCookEventDto {
  @IsString()
  @Length(1, 64)
  eventType!: string;

  @IsInt()
  @Min(1)
  clientSeq!: number;

  @IsISO8601()
  clientTime!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

import { Type } from 'class-transformer';
import { IsNumber, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTasteOverrideDto {
  @ApiProperty({ nullable: true, minimum: -1, maximum: 1 })
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  value!: number | null;
}

import { Type } from 'class-transformer';
import { IsNumber, Max, Min, ValidateIf } from 'class-validator';

export class UpdateTasteOverrideDto {
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  value!: number | null;
}

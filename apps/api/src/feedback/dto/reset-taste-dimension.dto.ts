import { Equals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetTasteDimensionDto {
  @ApiProperty({ enum: [true] })
  @Equals(true)
  confirm!: true;
}

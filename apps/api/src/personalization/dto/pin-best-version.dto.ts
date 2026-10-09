import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PinBestVersionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  personalizedRecipeVersionId!: string;
}

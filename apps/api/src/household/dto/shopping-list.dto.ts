import { ApiProperty } from '@nestjs/swagger';
import { IsHash } from 'class-validator';

export class GenerateHouseholdShoppingListDto {
  @ApiProperty({
    pattern: '^[a-f0-9]{64}$',
    description: 'SHA-256 inputHash from the latest shopping-requirements preview.',
  })
  @IsHash('sha256')
  expectedInputHash!: string;
}

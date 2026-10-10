import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class HouseholdNameDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Nhà mình' })
  @IsString()
  @Length(1, 120)
  name!: string;
}

export class AcceptHouseholdInviteDto {
  @ApiProperty({ description: 'Opaque one-time invitation token.' })
  @IsString()
  @Length(32, 256)
  token!: string;
}

import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: 320, example: 'ban@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ format: 'password', maxLength: 128, writeOnly: true })
  @IsString()
  @MaxLength(128)
  password!: string;
}

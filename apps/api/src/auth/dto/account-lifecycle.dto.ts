import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmailLifecycleRequestDto {
  @ApiProperty({ format: 'email', maxLength: 320, example: 'ban@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class TokenConfirmationDto {
  @ApiProperty({ minLength: 32, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;
}

export class PasswordResetConfirmDto extends TokenConfirmationDto {
  @ApiProperty({ format: 'password', minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password', maxLength: 128, writeOnly: true })
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ format: 'password', minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}

export class DeleteAccountDto {
  @ApiProperty({ format: 'password', maxLength: 128, writeOnly: true })
  @IsString()
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: ['DELETE'] })
  @IsString()
  @IsIn(['DELETE'])
  @Equals('DELETE')
  confirm!: 'DELETE';
}

import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdminRecipeDto {
  @ApiProperty({ example: 'dau-phu-sot-ca-chua' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(180)
  slug!: string;

  @ApiProperty({ example: 'Đậu phụ sốt cà chua' })
  @IsString()
  @MaxLength(180)
  title!: string;

  @ApiPropertyOptional({ example: 'vietnamese', default: 'vietnamese' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cuisine?: string;
}

export class UpdateRecipeDraftDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  content!: Record<string, unknown>;
}

export class PublishRecipeDraftDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

import { IsUUID } from 'class-validator';

export class PinBestVersionDto {
  @IsUUID()
  personalizedRecipeVersionId!: string;
}

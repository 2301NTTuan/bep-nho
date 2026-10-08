import { Equals } from 'class-validator';

export class ResetTasteDimensionDto {
  @Equals(true)
  confirm!: true;
}

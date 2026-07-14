import { IsObject, IsOptional } from 'class-validator';

export class CreatePopupDto {
  @IsObject()
  schema!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  displayRules?: Record<string, unknown>;
}

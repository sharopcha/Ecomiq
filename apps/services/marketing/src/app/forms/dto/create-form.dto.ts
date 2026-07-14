import { IsObject } from 'class-validator';

export class CreateFormDto {
  @IsObject()
  schema!: Record<string, unknown>;
}

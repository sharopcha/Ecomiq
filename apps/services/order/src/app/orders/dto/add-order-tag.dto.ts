import { IsString } from 'class-validator';

export class AddOrderTagDto {
  /** Opaque `tag.id` — catalog-owned, no cross-DB FK (ADR-2). */
  @IsString()
  tagId!: string;
}

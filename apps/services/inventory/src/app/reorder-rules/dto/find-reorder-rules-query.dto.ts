import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';

export class FindReorderRulesQueryDto extends PaginationQueryDto {
  /** Filter to rules on one variant — e.g. to check whether a row already has a rule before showing "Set Automatic Reorder" vs "Edit". */
  @IsOptional()
  @IsString()
  variantId?: string;
}

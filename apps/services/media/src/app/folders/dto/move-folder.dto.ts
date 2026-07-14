import { IsOptional, IsString } from 'class-validator';

export class MoveFolderDto {
  /** Omitted/null moves the folder to the root level. */
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

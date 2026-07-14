import { IsOptional, IsString } from 'class-validator';

export class MoveFileDto {
  /** Omitted/null moves the file to the store's root (no folder). */
  @IsOptional()
  @IsString()
  folderId?: string | null;
}

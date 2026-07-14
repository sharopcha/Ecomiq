import { IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class PresignUploadDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  mimeType!: string;

  @IsInt()
  @IsPositive()
  declaredSizeBytes!: number;

  @IsOptional()
  @IsString()
  folderId?: string;
}

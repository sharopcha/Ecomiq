import { IsOptional, IsString } from 'class-validator';

export class SearchSourceQueryDto {
  /** Omitted returns the adapter's whole fixed catalog/manifest. */
  @IsOptional()
  @IsString()
  q?: string;
}

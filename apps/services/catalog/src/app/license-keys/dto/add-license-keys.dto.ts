import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

/** Bulk import is the common real-world shape (paste a list of keys bought from a supplier) — a single key is just a one-element array. */
export class AddLicenseKeysDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  keyValues!: string[];
}

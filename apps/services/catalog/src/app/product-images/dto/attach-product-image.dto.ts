import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class AttachProductImageDto {
  /** Opaque file reference — no media service to validate against yet (see ProductImage entity comment). */
  @IsString()
  @MinLength(1)
  fileId!: string;

  /** Omit to append at the end of the product's current image order. */
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

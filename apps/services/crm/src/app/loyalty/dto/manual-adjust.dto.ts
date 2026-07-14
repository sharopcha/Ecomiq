import { IsInt, IsOptional, IsString, NotEquals } from 'class-validator';

export class ManualAdjustDto {
  @IsInt()
  @NotEquals(0)
  pointsDelta!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

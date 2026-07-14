import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateReturnLineDto {
  @IsString()
  orderLineId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class CreateReturnRequestDto {
  @IsString()
  orderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnLineDto)
  lines!: CreateReturnLineDto[];

  @IsOptional()
  @IsString()
  reason?: string;
}

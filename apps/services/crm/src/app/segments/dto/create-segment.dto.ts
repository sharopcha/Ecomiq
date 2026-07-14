import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, MinLength, ValidateNested } from 'class-validator';
import { SegmentRuleConditionDto } from './segment-rule-condition.dto';

export class CreateSegmentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SegmentRuleConditionDto)
  rule!: SegmentRuleConditionDto[];
}

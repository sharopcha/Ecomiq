import { IsIn, IsString, MinLength } from 'class-validator';

export class SegmentRuleConditionDto {
  @IsString()
  @MinLength(1)
  field!: string;

  @IsIn(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'])
  op!: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';

  value!: unknown;
}

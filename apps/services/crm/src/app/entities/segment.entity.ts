import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

export interface SegmentRuleCondition {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value: unknown;
}

/**
 * `rule` is an array of `{field, op, value}` conditions, AND-ed together —
 * evaluated against a fixed whitelist of customer (+ loyalty tier) columns
 * (see `segment-rule.util.ts`), never interpolated as raw SQL, so there's
 * no dynamic-column-injection surface no matter what a caller puts in
 * `field`. `member_count` is stamped by `evaluate()`, not kept live —
 * membership is materialized on demand, not on every customer write.
 */
@Entity('segment')
export class Segment extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'jsonb' })
  rule!: SegmentRuleCondition[];

  @Column({ type: 'int', name: 'member_count', default: 0 })
  memberCount!: number;
}

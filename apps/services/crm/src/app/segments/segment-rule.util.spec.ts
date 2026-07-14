import { BadRequestException } from '@nestjs/common';
import { assertValidSegmentRule, compileSegmentRule } from './segment-rule.util';
import { SegmentRuleCondition } from '../entities/segment.entity';

describe('compileSegmentRule', () => {
  it('compiles a plain whitelisted field into a parameterized WHERE clause', () => {
    const rules: SegmentRuleCondition[] = [{ field: 'total_spent_minor', op: 'gte', value: 10_000 }];
    const result = compileSegmentRule(rules);
    expect(result.whereClauses).toEqual(['customer.total_spent_minor >= :rule_0']);
    expect(result.params).toEqual({ rule_0: 10_000 });
    expect(result.needsLoyaltyJoin).toBe(false);
  });

  it('flags needsLoyaltyJoin only when a rule references loyalty_tier', () => {
    const rules: SegmentRuleCondition[] = [{ field: 'loyalty_tier', op: 'eq', value: 'gold' }];
    const result = compileSegmentRule(rules);
    expect(result.whereClauses).toEqual(['loyalty_account.tier = :rule_0']);
    expect(result.needsLoyaltyJoin).toBe(true);
  });

  it('does not set needsLoyaltyJoin when no rule references loyalty_tier', () => {
    const rules: SegmentRuleCondition[] = [{ field: 'total_orders', op: 'gt', value: 1 }];
    expect(compileSegmentRule(rules).needsLoyaltyJoin).toBe(false);
  });

  it('compiles multiple conditions with distinct parameter names', () => {
    const rules: SegmentRuleCondition[] = [
      { field: 'total_spent_minor', op: 'gte', value: 5_000 },
      { field: 'source', op: 'eq', value: 'web' },
    ];
    const result = compileSegmentRule(rules);
    expect(result.whereClauses).toEqual([
      'customer.total_spent_minor >= :rule_0',
      'customer.source = :rule_1',
    ]);
    expect(result.params).toEqual({ rule_0: 5_000, rule_1: 'web' });
  });

  it('rejects a field not in the whitelist — this is the whole dynamic-column-injection guard', () => {
    const rules = [{ field: 'password_hash', op: 'eq', value: 'x' }] as SegmentRuleCondition[];
    expect(() => compileSegmentRule(rules)).toThrow(BadRequestException);
    expect(() => compileSegmentRule(rules)).toThrow(/Unknown segment rule field/);
  });

  it('rejects an unknown operator', () => {
    const rules = [{ field: 'total_orders', op: 'like', value: 1 }] as unknown as SegmentRuleCondition[];
    expect(() => compileSegmentRule(rules)).toThrow(BadRequestException);
    expect(() => compileSegmentRule(rules)).toThrow(/Unknown segment rule operator/);
  });

  it('rejects a non-array value for the "in" operator', () => {
    const rules: SegmentRuleCondition[] = [{ field: 'source', op: 'in', value: 'web' }];
    expect(() => compileSegmentRule(rules)).toThrow(BadRequestException);
    expect(() => compileSegmentRule(rules)).toThrow(/requires an array value/);
  });

  it('accepts an array value for the "in" operator', () => {
    const rules: SegmentRuleCondition[] = [{ field: 'source', op: 'in', value: ['web', 'pos'] }];
    const result = compileSegmentRule(rules);
    expect(result.params).toEqual({ rule_0: ['web', 'pos'] });
  });
});

describe('assertValidSegmentRule', () => {
  it('does not throw for a valid rule', () => {
    expect(() =>
      assertValidSegmentRule([{ field: 'total_orders', op: 'gte', value: 1 }]),
    ).not.toThrow();
  });

  it('throws the same BadRequestException compileSegmentRule would', () => {
    expect(() =>
      assertValidSegmentRule([{ field: 'not_a_real_field', op: 'eq', value: 1 } as unknown as SegmentRuleCondition]),
    ).toThrow(BadRequestException);
  });
});

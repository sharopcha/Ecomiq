import { BadRequestException } from '@nestjs/common';
import { SegmentRuleCondition } from '../entities/segment.entity';

interface FieldSpec {
  /** Fully-qualified, already-safe SQL column reference — never built from user input. */
  column: string;
  type: 'number' | 'string' | 'date';
  /** Whether this field requires the `loyalty_account` join to resolve. */
  needsLoyaltyJoin?: boolean;
}

/**
 * The whole reason segment rules can't do dynamic-column-injection: `field`
 * is looked up here, never concatenated into SQL directly. Anything not in
 * this map is rejected outright, at rule-save time and at evaluate time
 * alike — matches §0's list of fields (`total_spent_minor`, `total_orders`,
 * `source`, `created_at`, `loyalty tier`).
 */
const FIELD_WHITELIST: Record<string, FieldSpec> = {
  total_spent_minor: { column: 'customer.total_spent_minor', type: 'number' },
  total_orders: { column: 'customer.total_orders', type: 'number' },
  source: { column: 'customer.source', type: 'string' },
  created_at: { column: 'customer.created_at', type: 'date' },
  loyalty_tier: { column: 'loyalty_account.tier', type: 'string', needsLoyaltyJoin: true },
};

const OP_SQL: Record<SegmentRuleCondition['op'], string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'IN',
};

export interface CompiledSegmentQuery {
  whereClauses: string[];
  params: Record<string, unknown>;
  needsLoyaltyJoin: boolean;
}

/** Validates every condition against the whitelist and compiles parameterized SQL fragments. Throws `BadRequestException` on anything not whitelisted — never silently drops or falls back to raw interpolation. */
export function compileSegmentRule(rules: SegmentRuleCondition[]): CompiledSegmentQuery {
  const whereClauses: string[] = [];
  const params: Record<string, unknown> = {};
  let needsLoyaltyJoin = false;

  rules.forEach((condition, index) => {
    const spec = FIELD_WHITELIST[condition.field];
    if (!spec) {
      throw new BadRequestException(`Unknown segment rule field "${condition.field}"`);
    }
    const opSql = OP_SQL[condition.op];
    if (!opSql) {
      throw new BadRequestException(`Unknown segment rule operator "${condition.op}"`);
    }
    if (condition.op === 'in' && !Array.isArray(condition.value)) {
      throw new BadRequestException(`Operator "in" requires an array value for field "${condition.field}"`);
    }

    if (spec.needsLoyaltyJoin) needsLoyaltyJoin = true;

    const paramName = `rule_${index}`;
    whereClauses.push(`${spec.column} ${opSql} :${paramName}`);
    params[paramName] = condition.value;
  });

  return { whereClauses, params, needsLoyaltyJoin };
}

/** Field/op validation only (no DB access) — used to reject an invalid rule at create/update time, before it's ever evaluated. */
export function assertValidSegmentRule(rules: SegmentRuleCondition[]): void {
  compileSegmentRule(rules);
}

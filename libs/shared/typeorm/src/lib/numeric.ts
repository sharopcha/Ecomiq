import { ValueTransformer } from 'typeorm';

/**
 * TypeORM transformer for `numeric`/`decimal` columns (rating_avg, weights,
 * lat/lng, ...). node-postgres returns `numeric` as a *string* (same
 * precision-safety reasoning as `bigint` — see money.ts's `MoneyTransformer`),
 * so without this transformer any entity typing such a column as `number`
 * (e.g. `rating_avg`) is lying about its runtime type: reads come back as
 * `"5.0"`, not `5`, which breaks strict equality and arithmetic alike.
 *
 * Usage: `@Column({ type: 'numeric', precision: 2, scale: 1, name: 'rating_avg', nullable: true, transformer: NumericTransformer })`
 */
export const NumericTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

import { Column, DeleteDateColumn, Index, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { TimestampedEntity } from './base.entity';

/**
 * Base for every table that carries `store_id` — i.e. almost every table
 * in this repo. Per ADR-2 ("database-per-service"),
 * each service gets its own database, but *within* that database every
 * table is still shared across all tenants (stores); `store_id` is the only
 * thing separating one store's rows from another's, so scoping it
 * correctly on every query is the whole ballgame for tenant isolation.
 */
export abstract class TenantScopedEntity extends TimestampedEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;
}

/**
 * TenantScopedEntity + soft delete. `deleted_at`
 * only appears "where UI has Archive" (product, blog posts, reviews) —
 * everything else just uses TenantScopedEntity. A separate class rather than
 * making TenantScopedEntity itself soft-deletable, since most tenant tables
 * (vendor, category, tag, ...) are hard-deleted.
 */
export abstract class TenantScopedSoftDeletableEntity extends TenantScopedEntity {
  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deletedAt?: Date | null;
}

/**
 * Adds `<alias>.store_id = :storeId` to a query builder. Use this on every
 * list/detail query instead of hand-writing the `andWhere` — one place to
 * fix if the tenant-scoping strategy ever changes (e.g. to Postgres RLS).
 */
export function scopeToStore<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  storeId: string,
): SelectQueryBuilder<T> {
  return qb.andWhere(`${alias}.store_id = :storeId`, { storeId });
}

/**
 * Guard for single-row reads/writes fetched by id alone (e.g.
 * `repo.findOne({ where: { id } })`) where the query itself didn't filter by
 * store. Throws (via the caller-supplied factory, e.g. `() => new NotFoundException()`)
 * if the row doesn't exist *or* belongs to a different store — same
 * response either way, so a staff member in store A can't use response
 * differences to learn that a given id exists in store B.
 */
export function assertOwnedByStore<T extends { storeId: string }>(
  entity: T | null | undefined,
  storeId: string,
  onViolation: () => Error,
): T {
  if (!entity || entity.storeId !== storeId) {
    throw onViolation();
  }
  return entity;
}

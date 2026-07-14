import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';

/**
 * Shared PK strategy: `id text` ULID (26 chars),
 * generated in-app (not by Postgres). Sorts chronologically, no coordination
 * needed across services — this is also what makes the ULID usable directly
 * as a pagination cursor (see pagination.ts).
 *
 * Originally lived in apps/services/identity/src/app/common/base.entity.ts;
 * moved here (2026-07-06) so every
 * service shares one implementation instead of copy-pasting it per service.
 * identity-service's copy now just re-exports this one.
 */
export abstract class BaseEntity {
  @PrimaryColumn('text')
  id!: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = ulid();
    }
  }
}

/**
 * BaseEntity + the created_at/updated_at columns most domain tables need
 * (product, product_variant, etc.).
 * `@CreateDateColumn`/`@UpdateDateColumn` are TypeORM-managed (set/refreshed
 * automatically on insert/save), not just DB defaults, so application code
 * never has to touch them.
 */
export abstract class TimestampedEntity extends BaseEntity {
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}

/**
 * TimestampedEntity + soft delete via `deleted_at`. TypeORM's
 * `@DeleteDateColumn` wires up `repository.softRemove()`/`.restore()` and
 * automatically excludes soft-deleted rows from `find*` calls — matches
 * `product.deleted_at` in the data model, which needs "archived" products to
 * disappear from normal queries without losing history.
 */
export abstract class SoftDeletableEntity extends TimestampedEntity {
  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deletedAt?: Date | null;
}

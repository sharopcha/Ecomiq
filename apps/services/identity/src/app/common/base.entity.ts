/**
 * Re-exported from the shared lib (2026-07-06) so every service's entities
 * extend the exact same ULID PK
 * implementation instead of a per-service copy. Kept as a re-export (rather
 * than updating every entity's import) so this file's existing import path
 * (`'../common/base.entity'`) keeps working unchanged.
 *
 * See libs/shared/typeorm/src/lib/base.entity.ts for the implementation,
 * plus TimestampedEntity/SoftDeletableEntity if a future identity entity
 * needs created_at/updated_at/deleted_at.
 */
export { BaseEntity } from '@temp-nx/typeorm';

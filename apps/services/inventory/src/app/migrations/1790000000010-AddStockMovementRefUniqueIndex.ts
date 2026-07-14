import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive partial unique index on `stock_movement (ref_table, ref_id)`,
 * scoped to `WHERE ref_table = 'purchase_order'` — see the entity's doc
 * comment for the full idempotency reasoning. inventory-service runs
 * `synchronize: true` in dev (this migration exists only for the prod
 * path, same as `InitInventorySchema`), so this file is additive rather
 * than an edit to that initial migration.
 */
export class AddStockMovementRefUniqueIndex1790000000010 implements MigrationInterface {
  name = 'AddStockMovementRefUniqueIndex1790000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX stock_movement_po_ref_unique_idx
        ON stock_movement (ref_table, ref_id)
        WHERE ref_table = 'purchase_order'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS stock_movement_po_ref_unique_idx`);
  }
}

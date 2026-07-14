import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive nullable `source_reorder_rule_id` on `purchase_order`, plus a
 * partial unique index capping a reorder rule at one *open* auto-draft PO
 * at a time — see the entity's doc comment. Mirrors inventory-service's
 * `AddStockMovementRefUniqueIndex` migration in spirit (an additive index
 * added in its own migration, not folded into an earlier one).
 */
export class AddPurchaseOrderSourceReorderRuleId1789900000050 implements MigrationInterface {
  name = 'AddPurchaseOrderSourceReorderRuleId1789900000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE purchase_order ADD COLUMN source_reorder_rule_id text`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX purchase_order_open_auto_draft_idx
        ON purchase_order (source_reorder_rule_id)
        WHERE source_reorder_rule_id IS NOT NULL AND status NOT IN ('received', 'canceled')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS purchase_order_open_auto_draft_idx`);
    await queryRunner.query(`ALTER TABLE purchase_order DROP COLUMN IF EXISTS source_reorder_rule_id`);
  }
}

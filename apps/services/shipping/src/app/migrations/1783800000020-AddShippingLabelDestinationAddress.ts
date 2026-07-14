import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive column vs. the original DDL — same snapshot-column reasoning as
 * `return_address` (see `shipping-label.entity.ts`'s doc comment). Needed
 * so a purchase call can read the label's own destination postal code for
 * the carrier port's deterministic-failure check, without the caller
 * having to resupply it.
 */
export class AddShippingLabelDestinationAddress1783800000020 implements MigrationInterface {
  name = 'AddShippingLabelDestinationAddress1783800000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE shipping_label ADD COLUMN destination_address jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE shipping_label DROP COLUMN IF EXISTS destination_address`);
  }
}

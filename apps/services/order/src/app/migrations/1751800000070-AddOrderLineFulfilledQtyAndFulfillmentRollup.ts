import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `order_line.fulfilled_qty` tracks cumulative units shipped against a
 * line, incremented as `shipping.fulfillment.created` events arrive —
 * comparing it against `qty` per line is what lets the rollup derive
 * `order.fulfillment_status` without shipping-service needing to know
 * order-service's own status vocabulary.
 *
 * `fulfillment_rollup` is a pure idempotency ledger — one row per
 * fulfillment id already applied — so a redelivered
 * `shipping.fulfillment.created` event (`PulsarServer`'s at-least-once
 * delivery) never double-increments a line's `fulfilled_qty`. The primary
 * key *is* the fulfillment id: no separate row id needed for a table that's
 * pure existence-check.
 */
export class AddOrderLineFulfilledQtyAndFulfillmentRollup1751800000070 implements MigrationInterface {
  name = 'AddOrderLineFulfilledQtyAndFulfillmentRollup1751800000070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE order_line ADD COLUMN fulfilled_qty integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`
      CREATE TABLE fulfillment_rollup (
        fulfillment_id text PRIMARY KEY,
        order_id text NOT NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE fulfillment_rollup`);
    await queryRunner.query(`ALTER TABLE order_line DROP COLUMN fulfilled_qty`);
  }
}

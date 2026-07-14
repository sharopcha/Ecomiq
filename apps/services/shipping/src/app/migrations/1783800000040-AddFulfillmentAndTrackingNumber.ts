import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `fulfillment`, `fulfillment_line`, `tracking_number` per the data model.
 * `order_id`/`order_line_id` are plain text columns, not FKs — order and
 * order_line live in order_db (ADR-2). `fulfillment_id` FKs are same-DB
 * (both tables live in shipping_db).
 */
export class AddFulfillmentAndTrackingNumber1783800000040 implements MigrationInterface {
  name = 'AddFulfillmentAndTrackingNumber1783800000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulfillment (
        id              text PRIMARY KEY,
        store_id        text NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        order_id        text NOT NULL,
        notify_customer boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`CREATE INDEX fulfillment_store_id_idx ON fulfillment (store_id)`);
    await queryRunner.query(`CREATE INDEX fulfillment_order_id_idx ON fulfillment (order_id)`);

    await queryRunner.query(`
      CREATE TABLE fulfillment_line (
        fulfillment_id text NOT NULL REFERENCES fulfillment(id) ON DELETE CASCADE,
        order_line_id  text NOT NULL,
        qty            int NOT NULL,
        weight_lb      numeric(10,2),
        PRIMARY KEY (fulfillment_id, order_line_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE tracking_number (
        id             text PRIMARY KEY,
        fulfillment_id text NOT NULL REFERENCES fulfillment(id) ON DELETE CASCADE,
        value          text NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX tracking_number_fulfillment_id_idx ON tracking_number (fulfillment_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tracking_number`);
    await queryRunner.query(`DROP TABLE IF EXISTS fulfillment_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS fulfillment`);
  }
}

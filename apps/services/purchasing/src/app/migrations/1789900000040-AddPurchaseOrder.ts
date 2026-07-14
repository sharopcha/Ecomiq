import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `purchase_order` + `purchase_order_line` per the data model (§6),
 * `po_status`/`payment_terms` Postgres enums. `assigned_to`/
 * `deliver_to_location_id` stay opaque text columns (identity_db/
 * inventory_db, ADR-2, no cross-DB FK). `purchase_order_line` has no
 * `store_id`/timestamps of its own — scoped only through `po_id` (`ON
 * DELETE CASCADE`), same shape as order-service's `order_line`.
 * `supplier_catalog_item_id` is a real same-DB FK; `variant_id` stays
 * opaque (catalog_db).
 */
export class AddPurchaseOrder1789900000040 implements MigrationInterface {
  name = 'AddPurchaseOrder1789900000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE po_status AS ENUM ('draft', 'sent', 'confirmed', 'partially_received', 'received', 'canceled')`,
    );
    await queryRunner.query(
      `CREATE TYPE payment_terms AS ENUM ('cod', 'prepaid', 'net_15', 'net_30', 'net_60')`,
    );

    await queryRunner.query(`
      CREATE TABLE purchase_order (
        id                      text PRIMARY KEY,
        store_id                text NOT NULL,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        display_id              text NOT NULL,
        supplier_id             text NOT NULL REFERENCES supplier(id),
        status                  po_status NOT NULL DEFAULT 'draft',
        expected_delivery_date  date,
        assigned_to             text,
        payment_terms           payment_terms NOT NULL DEFAULT 'cod',
        deliver_to_location_id  text,
        carrier                 text,
        note                    text,
        subtotal_minor          bigint,
        tax_rate                numeric(5,2),
        total_minor             bigint,
        email_to                citext,
        email_subject           text,
        email_body              text,
        sent_at                 timestamptz,
        UNIQUE (store_id, display_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX purchase_order_store_id_idx ON purchase_order (store_id)`);
    await queryRunner.query(`CREATE INDEX purchase_order_display_id_idx ON purchase_order (display_id)`);
    await queryRunner.query(`CREATE INDEX purchase_order_supplier_id_idx ON purchase_order (supplier_id)`);

    await queryRunner.query(`
      CREATE TABLE purchase_order_line (
        id                        text PRIMARY KEY,
        po_id                     text NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
        supplier_catalog_item_id  text REFERENCES supplier_catalog_item(id),
        variant_id                text,
        description               text NOT NULL,
        sku                       text,
        qty                       int NOT NULL,
        unit_cost_minor           bigint NOT NULL,
        received_qty              int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX purchase_order_line_po_id_idx ON purchase_order_line (po_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_order_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_order`);
    await queryRunner.query(`DROP TYPE IF EXISTS payment_terms`);
    await queryRunner.query(`DROP TYPE IF EXISTS po_status`);
  }
}

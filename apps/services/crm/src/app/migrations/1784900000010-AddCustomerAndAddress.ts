import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `customer`, `customer_address`, `store_sequence`, `activity_log` per the
 * data model. `customer_address` has no `store_id` of its own — scoped only
 * via `customer_id` (same-DB FK, `ON DELETE CASCADE`). `order_channel_type`
 * is crm's own copy of the enum catalog/order already define in their own
 * databases (ADR-2, no cross-DB shared types). `password_hash`/
 * `registered_at` are deliberately not part of this migration — they arrive
 * additively once customer auth exists.
 *
 * `total_spent_minor bigint DEFAULT '0'::bigint`, not bare `DEFAULT 0` —
 * Postgres normalizes a plain integer-literal default on a `bigint` column
 * to the cast form in `information_schema.column_default` (order-service's
 * `InitOrderSchema` migration hit this first; `total_orders`, a plain `int`
 * counter, is unaffected — Postgres doesn't re-cast those).
 */
export class AddCustomerAndAddress1784900000010 implements MigrationInterface {
  name = 'AddCustomerAndAddress1784900000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(
      `CREATE TYPE order_channel_type AS ENUM ('online_store', 'pos', 'manual', 'marketplace', 'mobile_app')`,
    );

    await queryRunner.query(`
      CREATE TABLE customer (
        id                text PRIMARY KEY,
        store_id          text NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        display_id        text NOT NULL,
        full_name         text NOT NULL,
        email             citext,
        phone             text,
        avatar_file_id    text,
        source            order_channel_type NOT NULL DEFAULT 'online_store',
        status            text NOT NULL DEFAULT 'active',
        total_orders      int NOT NULL DEFAULT 0,
        total_spent_minor bigint NOT NULL DEFAULT '0'::bigint,
        last_online_at    timestamptz,
        UNIQUE (store_id, display_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX customer_store_id_idx ON customer (store_id)`);
    await queryRunner.query(`CREATE INDEX customer_display_id_idx ON customer (display_id)`);

    await queryRunner.query(`
      CREATE TABLE customer_address (
        id                  text PRIMARY KEY,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        customer_id         text NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
        line1               text NOT NULL,
        line2               text,
        city                text,
        region              text,
        postal_code         text,
        country_code        char(2),
        lat                 numeric(9,6),
        lng                 numeric(9,6),
        is_default_shipping boolean NOT NULL DEFAULT false,
        is_default_billing  boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(
      `CREATE INDEX customer_address_customer_id_idx ON customer_address (customer_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE store_sequence (
        store_id   text NOT NULL,
        kind       text NOT NULL,
        next_value int NOT NULL DEFAULT 1,
        PRIMARY KEY (store_id, kind)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE activity_log (
        id            text PRIMARY KEY,
        store_id      text NOT NULL,
        subject_table text NOT NULL,
        subject_id    text NOT NULL,
        actor_id      text,
        actor_kind    text NOT NULL DEFAULT 'user',
        verb          text NOT NULL,
        data          jsonb,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX activity_log_store_id_idx ON activity_log (store_id)`);
    await queryRunner.query(
      `CREATE INDEX activity_log_subject_idx ON activity_log (subject_table, subject_id, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS activity_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_sequence`);
    await queryRunner.query(`DROP TABLE IF EXISTS customer_address`);
    await queryRunner.query(`DROP TABLE IF EXISTS customer`);
    await queryRunner.query(`DROP TYPE IF EXISTS order_channel_type`);
  }
}

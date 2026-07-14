import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `supplier`, `store_sequence`, `activity_log` per the data model (§6).
 * `password_hash`/`registered_at` are added here too, additively (nullable,
 * no default), anticipating the supplier-portal auth principal (Step 11) —
 * unlike crm's customer table, which deferred those same two columns to a
 * later migration. `last_logged_in_at` is part of the base `supplier` shape
 * in the data model, not an addition.
 *
 * `rating_count int NOT NULL DEFAULT 0` (a plain int, not a `bigint` money
 * column) needs no cast-form default — order-service's/crm's bigint-default
 * gotcha doesn't apply here.
 */
export class AddSupplier1789900000010 implements MigrationInterface {
  name = 'AddSupplier1789900000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(`CREATE TYPE supplier_status AS ENUM ('active', 'inactive')`);

    await queryRunner.query(`
      CREATE TABLE supplier (
        id                text PRIMARY KEY,
        store_id          text NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        display_id        text NOT NULL,
        name              text NOT NULL,
        description       text,
        phone             text,
        email             citext,
        website           text,
        address_line1     text,
        city              text,
        region            text,
        postal_code       text,
        country_code      char(2),
        location_label    text,
        shipping_carriers text[],
        status            supplier_status NOT NULL DEFAULT 'active',
        is_featured       boolean NOT NULL DEFAULT false,
        is_favorite       boolean NOT NULL DEFAULT false,
        rating_avg        numeric(2,1),
        rating_count      int NOT NULL DEFAULT 0,
        joined_at         timestamptz,
        last_logged_in_at timestamptz,
        password_hash     text,
        registered_at     timestamptz,
        UNIQUE (store_id, display_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX supplier_store_id_idx ON supplier (store_id)`);
    await queryRunner.query(`CREATE INDEX supplier_display_id_idx ON supplier (display_id)`);

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
    await queryRunner.query(`DROP TABLE IF EXISTS supplier`);
    await queryRunner.query(`DROP TYPE IF EXISTS supplier_status`);
  }
}

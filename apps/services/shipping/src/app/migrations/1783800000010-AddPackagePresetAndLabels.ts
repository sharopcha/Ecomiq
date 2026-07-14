import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `package_preset`, `shipping_label`, `shipping_label_package` per the data
 * model. `order_id`/`order_line_id` are plain text columns, not FKs — order
 * and order_line live in order_db (ADR-2, database-per-service).
 * `package_preset_id` is a same-DB FK (both tables live in shipping_db).
 */
export class AddPackagePresetAndLabels1783800000010 implements MigrationInterface {
  name = 'AddPackagePresetAndLabels1783800000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE package_preset (
        id             text PRIMARY KEY,
        store_id       text NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        name           text NOT NULL,
        package_type   text,
        weight_kg      numeric(10,3),
        length_cm      numeric(10,2),
        width_cm       numeric(10,2),
        height_cm      numeric(10,2)
      )
    `);
    await queryRunner.query(`CREATE INDEX package_preset_store_id_idx ON package_preset (store_id)`);

    await queryRunner.query(`
      CREATE TABLE shipping_label (
        id              text PRIMARY KEY,
        store_id        text NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        order_id        text NOT NULL,
        carrier         text NOT NULL,
        service_type    text,
        insurance       text,
        ship_date       date,
        notify_customer boolean NOT NULL DEFAULT false,
        return_address  jsonb,
        subtotal_minor  bigint,
        discount_minor  bigint,
        total_minor     bigint,
        label_file_id   text,
        purchased_at    timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX shipping_label_store_id_idx ON shipping_label (store_id)`);
    await queryRunner.query(`CREATE INDEX shipping_label_order_id_idx ON shipping_label (order_id)`);

    await queryRunner.query(`
      CREATE TABLE shipping_label_package (
        id                text PRIMARY KEY,
        label_id          text NOT NULL REFERENCES shipping_label(id) ON DELETE CASCADE,
        order_line_id     text,
        package_preset_id text REFERENCES package_preset(id),
        package_name      text,
        package_type      text,
        item_weight_kg    numeric(10,3),
        total_weight_kg   numeric(10,3),
        length_cm         numeric(10,2),
        width_cm          numeric(10,2),
        height_cm         numeric(10,2),
        combined          boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(
      `CREATE INDEX shipping_label_package_label_id_idx ON shipping_label_package (label_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS shipping_label_package`);
    await queryRunner.query(`DROP TABLE IF EXISTS shipping_label`);
    await queryRunner.query(`DROP TABLE IF EXISTS package_preset`);
  }
}

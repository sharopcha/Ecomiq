import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `supplier_catalog_item` per the data model (§6), plus an additive
 * `variant_id` column (nullable, merchant-set) beyond the data model's own
 * DDL — anticipates Step 10's auto-draft PO consumer, which resolves a unit
 * cost by matching a reorder-triggered payload's `variantId` against this
 * column. `linked_product_id` stays an opaque text column (no FK) — catalog
 * lives in a different database (ADR-2).
 */
export class AddSupplierCatalogItem1789900000030 implements MigrationInterface {
  name = 'AddSupplierCatalogItem1789900000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE supplier_catalog_item (
        id                text PRIMARY KEY,
        store_id          text NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        supplier_id       text NOT NULL REFERENCES supplier(id),
        name              text NOT NULL,
        sku               text,
        price_min_minor   bigint,
        price_max_minor   bigint,
        min_order_qty     int,
        in_stock          boolean NOT NULL DEFAULT true,
        variant_count     int,
        image_file_id     text,
        linked_product_id text,
        variant_id        text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX supplier_catalog_item_store_id_idx ON supplier_catalog_item (store_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX supplier_catalog_item_supplier_id_idx ON supplier_catalog_item (supplier_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX supplier_catalog_item_variant_id_idx ON supplier_catalog_item (variant_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_catalog_item`);
  }
}

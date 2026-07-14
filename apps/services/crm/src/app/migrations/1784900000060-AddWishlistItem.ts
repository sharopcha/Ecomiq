import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `wishlist_item` per the data model, with `variant_id` as a plain text
 * column (not the DDL's inferred `REFERENCES product_variant(id)` — that
 * table lives in catalog_db, ADR-2 forbids a cross-DB FK; same precedent
 * as `product_review.product_id`). `customer_id` is a same-DB FK.
 */
export class AddWishlistItem1784900000060 implements MigrationInterface {
  name = 'AddWishlistItem1784900000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wishlist_item (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        customer_id text NOT NULL REFERENCES customer(id),
        variant_id  text NOT NULL,
        UNIQUE (customer_id, variant_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX wishlist_item_store_id_idx ON wishlist_item (store_id)`);
    await queryRunner.query(`CREATE INDEX wishlist_item_customer_id_idx ON wishlist_item (customer_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wishlist_item`);
  }
}

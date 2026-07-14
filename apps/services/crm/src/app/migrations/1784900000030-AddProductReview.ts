import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `product_review` per the data model. `product_id`/`order_id` are plain
 * text columns (product lives in catalog_db, order lives in order_db —
 * ADR-2, no cross-DB FK); `customer_id` is a same-DB FK. First hand-written
 * `CHECK` constraint in this repo — inline in the `CREATE TABLE`, matching
 * the data model doc's own style (no existing precedent to diverge from).
 */
export class AddProductReview1784900000030 implements MigrationInterface {
  name = 'AddProductReview1784900000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE product_review (
        id             text PRIMARY KEY,
        store_id       text NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        product_id     text,
        customer_id    text REFERENCES customer(id),
        order_id       text,
        rating         int NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title          text,
        body           text,
        media_file_ids text[],
        status         text NOT NULL DEFAULT 'pending',
        ai_sentiment   jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX product_review_store_id_idx ON product_review (store_id)`);
    await queryRunner.query(`CREATE INDEX product_review_product_id_idx ON product_review (product_id)`);
    await queryRunner.query(`CREATE INDEX product_review_customer_id_idx ON product_review (customer_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS product_review`);
  }
}

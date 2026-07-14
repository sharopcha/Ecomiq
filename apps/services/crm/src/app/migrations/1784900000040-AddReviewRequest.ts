import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `review_request` per the data model. `order_id` is a plain text column
 * (order lives in order_db, ADR-2); `customer_id`/`review_id` are same-DB
 * FKs into `customer`/`product_review` (both in crm_db).
 */
export class AddReviewRequest1784900000040 implements MigrationInterface {
  name = 'AddReviewRequest1784900000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE review_request (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        order_id    text NOT NULL,
        customer_id text NOT NULL REFERENCES customer(id),
        sent_at     timestamptz,
        review_id   text REFERENCES product_review(id)
      )
    `);
    await queryRunner.query(`CREATE INDEX review_request_store_id_idx ON review_request (store_id)`);
    await queryRunner.query(`CREATE INDEX review_request_customer_id_idx ON review_request (customer_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS review_request`);
  }
}

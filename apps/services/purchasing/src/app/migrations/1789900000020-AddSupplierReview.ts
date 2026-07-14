import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `supplier_review` per the data model (§6) — no `updated_at` column (just
 * `created_at`), matching the DDL exactly; reviews are created or deleted,
 * never edited in place.
 */
export class AddSupplierReview1789900000020 implements MigrationInterface {
  name = 'AddSupplierReview1789900000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE supplier_review (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        supplier_id text NOT NULL REFERENCES supplier(id),
        author_name text,
        rating      int NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title       text,
        body        text,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX supplier_review_supplier_id_idx ON supplier_review (supplier_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_review`);
  }
}

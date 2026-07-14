import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `segment` + additive `segment_member` materialization table. `rule` is
 * `jsonb`, validated/whitelisted at the application layer
 * (`segment-rule.util.ts`), not constrained at the DB layer — the whole
 * point is that arbitrary rule shapes can be stored freely since evaluation
 * never trusts `field` as a raw column name.
 */
export class AddSegmentAndSegmentMember1784900000090 implements MigrationInterface {
  name = 'AddSegmentAndSegmentMember1784900000090';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE segment (
        id           text PRIMARY KEY,
        store_id     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        name         text NOT NULL,
        rule         jsonb NOT NULL,
        member_count int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX segment_store_id_idx ON segment (store_id)`);

    await queryRunner.query(`
      CREATE TABLE segment_member (
        segment_id  text NOT NULL REFERENCES segment(id) ON DELETE CASCADE,
        customer_id text NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
        PRIMARY KEY (segment_id, customer_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX segment_member_customer_id_idx ON segment_member (customer_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS segment_member`);
    await queryRunner.query(`DROP TABLE IF EXISTS segment`);
  }
}

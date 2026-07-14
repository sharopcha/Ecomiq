import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive customer-auth columns on `customer` (`password_hash`,
 * `registered_at`, `referral_code` — all nullable, admin-created/imported
 * customers simply have none until they register or a code gets
 * generated) plus the `referral` table per the data model.
 */
export class AddCustomerAuthAndReferral1784900000050 implements MigrationInterface {
  name = 'AddCustomerAuthAndReferral1784900000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customer ADD COLUMN password_hash text`);
    await queryRunner.query(`ALTER TABLE customer ADD COLUMN registered_at timestamptz`);
    await queryRunner.query(`ALTER TABLE customer ADD COLUMN referral_code text`);
    await queryRunner.query(`CREATE INDEX customer_referral_code_idx ON customer (referral_code)`);

    await queryRunner.query(`
      CREATE TABLE referral (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        referrer_id text REFERENCES customer(id),
        referee_id  text NOT NULL REFERENCES customer(id),
        code        text NOT NULL,
        status      text NOT NULL DEFAULT 'pending'
      )
    `);
    await queryRunner.query(`CREATE INDEX referral_store_id_idx ON referral (store_id)`);
    await queryRunner.query(`CREATE INDEX referral_referrer_id_idx ON referral (referrer_id)`);
    await queryRunner.query(`CREATE INDEX referral_referee_id_idx ON referral (referee_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS referral`);
    await queryRunner.query(`ALTER TABLE customer DROP COLUMN IF EXISTS referral_code`);
    await queryRunner.query(`ALTER TABLE customer DROP COLUMN IF EXISTS registered_at`);
    await queryRunner.query(`ALTER TABLE customer DROP COLUMN IF EXISTS password_hash`);
  }
}

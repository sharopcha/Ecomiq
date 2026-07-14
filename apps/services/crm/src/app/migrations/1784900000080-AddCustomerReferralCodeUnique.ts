import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces Step 8's plain `referral_code` index with a partial unique one,
 * scoped per store — `ReferralsService.getOrCreateCode` generates codes
 * lazily, and a code only needs to be unique among customers that actually
 * have one (most won't, until they ask for it).
 */
export class AddCustomerReferralCodeUnique1784900000080 implements MigrationInterface {
  name = 'AddCustomerReferralCodeUnique1784900000080';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS customer_referral_code_idx`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX customer_store_id_referral_code_idx ON customer (store_id, referral_code) WHERE referral_code IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS customer_store_id_referral_code_idx`);
    await queryRunner.query(`CREATE INDEX customer_referral_code_idx ON customer (referral_code)`);
  }
}

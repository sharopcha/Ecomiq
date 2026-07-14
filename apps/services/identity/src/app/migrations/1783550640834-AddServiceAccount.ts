import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `service_account` table (client-credentials internal auth) —
 * missing from InitIdentitySchema,
 * which predates the ServiceAccount entity. Confirmed missing by diffing
 * a fresh migrated database against dev's `synchronize: true` output: the
 * `service_account` table simply didn't exist after `identity:migration:run`
 * on an empty database, which would break `identity:service-accounts:seed`
 * and `POST /auth/token` (client_credentials) in any real production
 * deployment run off migrations only.
 */
export class AddServiceAccount1783550640834 implements MigrationInterface {
  name = 'AddServiceAccount1783550640834';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE service_account (
        id             text PRIMARY KEY,
        client_id      text NOT NULL UNIQUE,
        secret_hash    text NOT NULL,
        service_name   text NOT NULL,
        allowed_scopes text[] NOT NULL DEFAULT '{}',
        is_active      boolean NOT NULL DEFAULT true,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE service_account;`);
  }
}

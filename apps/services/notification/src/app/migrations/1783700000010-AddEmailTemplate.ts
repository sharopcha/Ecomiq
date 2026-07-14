import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox)
 * `email_template` table (`ECOMIQ-DATA-MODEL.md` §10) — mirrors
 * `EmailTemplate` (`apps/services/notification/src/app/entities/email-template.entity.ts`).
 *
 * `updated_at` isn't in the data model's DDL comment but is included here:
 * `EmailTemplate` extends the shared `TenantScopedEntity`
 * (`@temp-nx/typeorm`), which carries both `created_at` and `updated_at` —
 * same as every other tenant-scoped table in this repo (vendor, category,
 * payment, ...) rather than hand-rolling a narrower base just for this one
 * table.
 */
export class AddEmailTemplate1783700000010 implements MigrationInterface {
  name = 'AddEmailTemplate1783700000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE template_kind AS ENUM ('order_notification', 'shipment_delay', 'return_approval', 'refund', 'purchase_order', 'campaign', 'custom')`,
    );
    await queryRunner.query(`
      CREATE TABLE email_template (
        id                 text PRIMARY KEY,
        store_id           text NOT NULL,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        kind               template_kind NOT NULL DEFAULT 'custom',
        name               text NOT NULL,
        subject            text,
        body               text,
        is_ai_recommended  boolean NOT NULL DEFAULT false,
        created_by         text
      )
    `);
    await queryRunner.query(`CREATE INDEX email_template_store_id_idx ON email_template (store_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS email_template`);
    await queryRunner.query(`DROP TYPE IF EXISTS template_kind`);
  }
}

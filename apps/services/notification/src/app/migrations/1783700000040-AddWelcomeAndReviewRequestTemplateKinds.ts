import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive: two new `template_kind` enum labels (`welcome`,
 * `review_request`) for crm-service's `notify.send` commands. Each
 * `ALTER TYPE ... ADD VALUE` is its own statement (Postgres forbids
 * multiple values per statement) and neither is used by a write in this
 * same migration, so both are safe inside a transaction on Postgres 12+
 * (the only restriction is using a freshly added value in the same
 * transaction that added it — this migration only adds labels, it never
 * writes rows with them).
 *
 * `down()` can't `DROP VALUE` from a Postgres enum directly — the
 * standard workaround (rename the old type, recreate it with the
 * original label set, cast every column using it across, drop the old
 * type) is used instead. Two tables use `template_kind`
 * (`email_template.kind`, `send_log.template_kind`) — both must be cast
 * in the same swap, since Postgres won't drop a type while any column
 * still depends on it. This will fail if any row of either table already
 * has `kind`/`template_kind = 'welcome'` or `'review_request'` at revert
 * time — a genuine constraint, not a bug: those rows have no equivalent
 * in the shrunk enum.
 */
export class AddWelcomeAndReviewRequestTemplateKinds1783700000040 implements MigrationInterface {
  name = 'AddWelcomeAndReviewRequestTemplateKinds1783700000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE template_kind ADD VALUE 'welcome'`);
    await queryRunner.query(`ALTER TYPE template_kind ADD VALUE 'review_request'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE template_kind RENAME TO template_kind_old`);
    await queryRunner.query(
      `CREATE TYPE template_kind AS ENUM ('order_notification', 'shipment_delay', 'return_approval', 'refund', 'purchase_order', 'campaign', 'custom')`,
    );
    await queryRunner.query(`ALTER TABLE email_template ALTER COLUMN kind DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE email_template ALTER COLUMN kind TYPE template_kind USING kind::text::template_kind`,
    );
    await queryRunner.query(`ALTER TABLE email_template ALTER COLUMN kind SET DEFAULT 'custom'`);
    await queryRunner.query(
      `ALTER TABLE send_log ALTER COLUMN template_kind TYPE template_kind USING template_kind::text::template_kind`,
    );
    await queryRunner.query(`DROP TYPE template_kind_old`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written `notification` table (`ECOMIQ-DATA-MODEL.md` §10, the bell
 * badge feed) — mirrors `Notification`
 * (`apps/services/notification/src/app/entities/notification.entity.ts`).
 *
 * `updated_at` isn't in the data model's DDL comment but is included here,
 * same reasoning as `email_template` — `Notification` extends the shared
 * `TenantScopedEntity`, and unlike `send_log` (Step 5, deliberately
 * append-only) this table's rows genuinely do get updated in place
 * (`read_at` on mark-read).
 *
 * `notification_store_id_user_id_idx` supports the feed/unread-count
 * queries' `WHERE store_id = ? AND (user_id = ? OR user_id IS NULL)` filter
 * directly.
 */
export class AddNotification1783700000020 implements MigrationInterface {
  name = 'AddNotification1783700000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notification (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        user_id     text,
        kind        text NOT NULL,
        title       text,
        body        text,
        ref_table   text,
        ref_id      text,
        read_at     timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX notification_store_id_idx ON notification (store_id)`);
    await queryRunner.query(
      `CREATE INDEX notification_store_id_user_id_idx ON notification (store_id, user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification`);
  }
}

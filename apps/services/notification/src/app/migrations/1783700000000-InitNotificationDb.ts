import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox —
 * same constraint as identity/catalog/inventory/payment/marketing/order's
 * Init migrations) initial schema for notification_db.
 *
 * Only the shared `OutboxMessage` (`@temp-nx/typeorm`) exists at this point
 * in the plan (Step 1) — domain entities (email_template, notification,
 * send_log) arrive in Steps 3–5, each with their own migration appended
 * here. Unlike payment/marketing (which each needed a follow-up
 * `AddOutboxTopicOverride` migration), this table includes `topic` and
 * `deliver_at` from the start: notification-service is the first service
 * scaffolded after both columns already existed in the shared entity, so
 * there's no earlier schema to patch.
 */
export class InitNotificationDb1783700000000 implements MigrationInterface {
  name = 'InitNotificationDb1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE outbox (
        id             text PRIMARY KEY,
        event_type     text NOT NULL,
        aggregate_type text NOT NULL,
        aggregate_id   text NOT NULL,
        store_id       text NOT NULL,
        payload        jsonb NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        deliver_at     timestamptz,
        processed_at   timestamptz,
        attempts       int NOT NULL DEFAULT 0,
        last_error     text,
        topic          text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX outbox_processed_at_created_at_idx ON outbox (processed_at, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outbox`);
  }
}

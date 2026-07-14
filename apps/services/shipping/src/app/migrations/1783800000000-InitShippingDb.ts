import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox —
 * same constraint as every other service's Init migration) initial schema
 * for shipping_db.
 *
 * Only the shared `OutboxMessage` (`@temp-nx/typeorm`) exists in this
 * migration — domain entities (package_preset, shipping_label, shipment,
 * fulfillment, ...) each arrive in their own migration appended here as
 * they're built. Includes `topic` and `deliver_at` from the start — same
 * precedent as notification-service's Init migration.
 */
export class InitShippingDb1783800000000 implements MigrationInterface {
  name = 'InitShippingDb1783800000000';

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

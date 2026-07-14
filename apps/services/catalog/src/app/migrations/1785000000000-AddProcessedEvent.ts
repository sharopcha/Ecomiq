import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `processed_event` — idempotency ledger for the new `crm.review.events`
 * consumer (CatalogSyncModule). Additive, doesn't touch any existing
 * catalog table. Same shape as crm-service's own `processed_event`
 * migration — composite `(event_id, handler)` primary key.
 */
export class AddProcessedEvent1785000000000 implements MigrationInterface {
  name = 'AddProcessedEvent1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE processed_event (
        event_id     text NOT NULL,
        handler      text NOT NULL,
        processed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (event_id, handler)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS processed_event`);
  }
}

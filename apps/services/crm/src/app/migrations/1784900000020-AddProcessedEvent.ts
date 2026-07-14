import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `processed_event` — idempotency ledger for the `orders.order.placed`
 * consumer's handlers, keyed on `(event_id, handler)` (see
 * `ProcessedEvent`'s doc comment for why a single-column key isn't enough).
 */
export class AddProcessedEvent1784900000020 implements MigrationInterface {
  name = 'AddProcessedEvent1784900000020';

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

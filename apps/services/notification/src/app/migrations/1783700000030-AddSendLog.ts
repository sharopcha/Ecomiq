import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written `send_log` table — mirrors `SendLog`
 * (`apps/services/notification/src/app/entities/send-log.entity.ts`), the
 * per-attempt delivery ledger Step 6's `DispatchService` will read/write.
 *
 * Reuses the `template_kind` enum type `AddEmailTemplate1783700000010`
 * already created — same logical domain, no reason for a second enum.
 * `send_channel`/`send_status` are new enum types specific to this table.
 */
export class AddSendLog1783700000030 implements MigrationInterface {
  name = 'AddSendLog1783700000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE send_channel AS ENUM ('email', 'sms', 'whatsapp', 'in_app')`);
    await queryRunner.query(`CREATE TYPE send_status AS ENUM ('pending', 'sent', 'failed', 'dead')`);
    await queryRunner.query(`
      CREATE TABLE send_log (
        id                  text PRIMARY KEY,
        store_id            text NOT NULL,
        channel             send_channel NOT NULL,
        recipient           text NOT NULL,
        template_kind       template_kind NOT NULL,
        rendered_subject    text,
        rendered_body       text,
        status              send_status NOT NULL DEFAULT 'pending',
        attempt             int NOT NULL DEFAULT 1,
        provider_message_id text,
        failure_reason      text,
        ref_table           text,
        ref_id              text,
        source_event_id     text NOT NULL,
        created_at          timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX send_log_store_id_idx ON send_log (store_id)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX send_log_source_event_id_uq ON send_log (source_event_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS send_log`);
    await queryRunner.query(`DROP TYPE IF EXISTS send_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS send_channel`);
  }
}

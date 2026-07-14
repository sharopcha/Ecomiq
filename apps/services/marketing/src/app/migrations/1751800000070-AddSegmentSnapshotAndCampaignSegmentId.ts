import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive: a `segment_snapshot` projection table (populated by
 * `SegmentSyncService` reacting to crm-service's `crm.segment.updated`,
 * cross-namespace) plus a nullable `campaign.segment_id` column so
 * campaign create/update can reference one. No FK on either — `id`/
 * `segment_id` are opaque references to crm's own `segment` table, a
 * different database (ADR-2, no cross-DB foreign keys).
 */
export class AddSegmentSnapshotAndCampaignSegmentId1751800000070 implements MigrationInterface {
  name = 'AddSegmentSnapshotAndCampaignSegmentId1751800000070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE segment_snapshot (
        id            text PRIMARY KEY,
        store_id      text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        name          text NOT NULL,
        member_count  int NOT NULL DEFAULT 0,
        member_emails jsonb NOT NULL,
        event_time    timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX segment_snapshot_store_id_idx ON segment_snapshot (store_id)`);

    await queryRunner.query(`ALTER TABLE campaign ADD COLUMN segment_id text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE campaign DROP COLUMN segment_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS segment_snapshot`);
  }
}

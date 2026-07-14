import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The shared `OutboxMessage` entity (`@temp-nx/typeorm`) gained an optional
 * `topic` override column back in order-service's own migration
 * (`payments.refund.execute` command routing) — deferred for every other
 * service "until a later change touches that service" (see
 * order-service's `AddOutboxTopicOverride1751800000050` doc comment for
 * the convention).
 *
 * This is that later change for marketing-service: the campaign-fire
 * handler emits `notify.send` commands onto `marketing/notify.commands`,
 * which is not the aggregate topic `topicForAggregate` would derive for a
 * `campaign`-aggregate outbox row, so the explicit override is a real,
 * imminent need here — this migration exists now rather than waiting for
 * the fire handler itself only because the campaign migration's own
 * migration-diff verification (`marketing:verify-migration`) caught the
 * drift the moment a second migration made the up/down/synchronize check
 * exercise it.
 */
export class AddMarketingOutboxTopicOverride1751800000040 implements MigrationInterface {
  name = 'AddMarketingOutboxTopicOverride1751800000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbox ADD COLUMN topic text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbox DROP COLUMN topic`);
  }
}

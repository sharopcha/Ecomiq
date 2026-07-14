import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The shared `OutboxMessage` entity (`@temp-nx/typeorm`) gained an optional
 * `topic` override column (order-service's `payments.refund.execute`
 * command routing needs it) — deferred for every other service until
 * something actually needs it there too (see order-service's
 * `AddOutboxTopicOverride1751800000050` doc comment for the convention;
 * marketing-service picked it up for the same reason).
 *
 * Running `payment:verify-migration` for real caught the drift here
 * (`outbox.topic` present via `synchronize:true`, absent from the
 * hand-written migration) — this migration closes it.
 */
export class AddPaymentOutboxTopicOverride1751800000020 implements MigrationInterface {
  name = 'AddPaymentOutboxTopicOverride1751800000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbox ADD COLUMN topic text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbox DROP COLUMN topic`);
  }
}

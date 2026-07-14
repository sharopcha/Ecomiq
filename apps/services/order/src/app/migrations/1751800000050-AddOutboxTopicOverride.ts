import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The shared `OutboxMessage` entity (`@temp-nx/typeorm`) gained an
 * optional `topic` override column (see its doc comment): approving a
 * refund publishes a `payments.refund.execute` command onto
 * payment-service's own `payments/payment.commands` topic, not anywhere
 * in order-service's own `orders` namespace, so the relay needs an
 * explicit override rather than deriving the topic from `aggregateType`.
 *
 * `refund` itself needs no schema change — `InitOrderSchema` already
 * created the full table (refund_type/refund_status enums, payment_id,
 * amount_minor, etc.) verbatim from the data model; this migration only
 * adds behavior on top of it.
 *
 * This column is nullable and shared across every service's `outbox`
 * table (same entity class, one migration per service) — only
 * order-service actually writes a non-null value today; every other
 * service's `outbox` table gets the column too (via their own
 * `synchronize:true` dev boot) but never populates it. Not migrated in
 * those other services' hand-written migrations yet — same "known,
 * accepted diff until a later change touches that service" convention as
 * this repo's other shared-lib extensions.
 */
export class AddOutboxTopicOverride1751800000050 implements MigrationInterface {
  name = 'AddOutboxTopicOverride1751800000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbox ADD COLUMN topic text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbox DROP COLUMN topic`);
  }
}

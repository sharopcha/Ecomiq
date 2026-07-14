import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The refund settlement loop needs somewhere to surface *why*
 * `payments.refund.failed` happened while the refund stays `processing`
 * (see `Refund.failureReason`'s doc comment).
 */
export class AddRefundFailureReason1751800000060 implements MigrationInterface {
  name = 'AddRefundFailureReason1751800000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE refund ADD COLUMN failure_reason text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE refund DROP COLUMN failure_reason`);
  }
}

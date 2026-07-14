import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two small additions on top of `InitOrderSchema`:
 *
 * 1. `"order".payment_id` — anticipated back in `Refund` entity's doc
 *    comment ("resolved once payments.payment.succeeded sets it on the
 *    order") but not added until now, since there was nothing to write
 *    there until the checkout saga's payment-result consumer existed.
 * 2. A partial unique index on `saga_state (order_id) WHERE status='running'`
 *    — the actual race-safety backstop behind `POST /:id/checkout`'s "not
 *    already in a running saga" guard (the controller's own pre-check is
 *    just a friendlier error message; this index is what a concurrent
 *    double-POST actually collides against).
 */
export class AddOrderPaymentIdAndSagaRunningUnique1751800000040 implements MigrationInterface {
  name = 'AddOrderPaymentIdAndSagaRunningUnique1751800000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order" ADD COLUMN payment_id text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX saga_state_order_id_running_uq ON saga_state (order_id) WHERE status = 'running'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX saga_state_order_id_running_uq`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN payment_id`);
  }
}

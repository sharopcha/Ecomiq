import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive column vs. the original DDL — the carrier tracking webhook's
 * idempotency key (see `shipment-event.entity.ts`'s doc comment). A
 * partial unique index (`WHERE carrier_event_id IS NOT NULL`) — same
 * pattern as order-service's `saga_state (order_id) WHERE status='running'`
 * — enforces uniqueness only for webhook-originated rows; manual entries
 * stay null and are unaffected.
 */
export class AddShipmentEventCarrierEventId1783800000050 implements MigrationInterface {
  name = 'AddShipmentEventCarrierEventId1783800000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE shipment_event ADD COLUMN carrier_event_id text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX shipment_event_carrier_event_id_idx ON shipment_event (carrier_event_id) WHERE carrier_event_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS shipment_event_carrier_event_id_idx`);
    await queryRunner.query(`ALTER TABLE shipment_event DROP COLUMN IF EXISTS carrier_event_id`);
  }
}

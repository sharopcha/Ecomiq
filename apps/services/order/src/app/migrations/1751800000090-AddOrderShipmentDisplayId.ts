import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the customer-facing tracking timeline resolve from an order id to
 * shipping-service's public tracking endpoint without a second
 * cross-service lookup — see `Order.shipmentDisplayId`'s doc comment.
 */
export class AddOrderShipmentDisplayId1751800000090 implements MigrationInterface {
  name = 'AddOrderShipmentDisplayId1751800000090';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order" ADD COLUMN "shipment_display_id" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "shipment_display_id"`);
  }
}

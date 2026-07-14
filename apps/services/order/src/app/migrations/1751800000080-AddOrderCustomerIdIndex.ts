import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderCustomerIdIndex1751800000080 implements MigrationInterface {
  name = 'AddOrderCustomerIdIndex1751800000080';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_order_store_customer" ON "order" ("store_id", "customer_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_order_store_customer";
    `);
  }
}

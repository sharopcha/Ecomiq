import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a delivered order line point back to a review target — see
 * `OrderLine.productId`'s doc comment.
 */
export class AddOrderLineProductId1751800000100 implements MigrationInterface {
  name = 'AddOrderLineProductId1751800000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_line" ADD COLUMN "product_id" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_line" DROP COLUMN "product_id"`);
  }
}

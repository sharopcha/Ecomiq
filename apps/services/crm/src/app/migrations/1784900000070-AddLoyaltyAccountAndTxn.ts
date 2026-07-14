import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `loyalty_account`/`loyalty_txn` per the data model. `loyalty_txn` adds
 * `store_id` beyond the literal DDL (every table in this repo carries its
 * own, avoiding a join through `loyalty_account` just to scope a query).
 * The partial unique index on `(reason, ref_id)` is what makes a replayed
 * `orders.order.placed` accrual a no-op at the DB level — see
 * `LoyaltyTxn`'s doc comment.
 */
export class AddLoyaltyAccountAndTxn1784900000070 implements MigrationInterface {
  name = 'AddLoyaltyAccountAndTxn1784900000070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE loyalty_account (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        customer_id text NOT NULL UNIQUE REFERENCES customer(id),
        points     int NOT NULL DEFAULT 0,
        tier       text NOT NULL DEFAULT 'bronze'
      )
    `);
    await queryRunner.query(`CREATE INDEX loyalty_account_store_id_idx ON loyalty_account (store_id)`);

    await queryRunner.query(`
      CREATE TABLE loyalty_txn (
        id           text PRIMARY KEY,
        store_id     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        account_id   text NOT NULL REFERENCES loyalty_account(id),
        points_delta int NOT NULL,
        reason       text NOT NULL,
        ref_id       text,
        note         text
      )
    `);
    await queryRunner.query(`CREATE INDEX loyalty_txn_store_id_idx ON loyalty_txn (store_id)`);
    await queryRunner.query(`CREATE INDEX loyalty_txn_account_id_idx ON loyalty_txn (account_id)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX loyalty_txn_reason_ref_id_idx ON loyalty_txn (reason, ref_id) WHERE ref_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS loyalty_txn`);
    await queryRunner.query(`DROP TABLE IF EXISTS loyalty_account`);
  }
}

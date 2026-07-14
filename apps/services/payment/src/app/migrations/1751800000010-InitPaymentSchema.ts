import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox —
 * same constraint as identity/catalog/inventory's Init migrations) initial
 * schema for payment_db — mirrors every entity under
 * `apps/services/payment/src/app/entities/*` plus the shared `OutboxMessage`
 * (`@temp-nx/typeorm`).
 *
 * Table order follows FK dependency order so `up()` never references a
 * not-yet-created table (`refund_execution` after `payment`); `down()` drops
 * in the reverse order for the same reason.
 *
 * `refund_execution.payment_id` is NOT NULL here, matching the entity's
 * explicit `@ManyToOne(() => Payment, { nullable: false, ... })` — verified
 * against a real `synchronize` run of the same entities (the
 * ManyToOne-defaults-to-nullable-true repo rule only bites when `nullable`
 * is *omitted*; explicit `false` is honored).
 */
export class InitPaymentSchema1751800000010 implements MigrationInterface {
  name = 'InitPaymentSchema1751800000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── outbox (BaseEntity + OutboxMessage columns — identical shape to catalog/inventory's) ──
    await queryRunner.query(`
      CREATE TABLE outbox (
        id             text PRIMARY KEY,
        event_type     text NOT NULL,
        aggregate_type text NOT NULL,
        aggregate_id   text NOT NULL,
        store_id       text NOT NULL,
        payload        jsonb NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        deliver_at     timestamptz,
        processed_at   timestamptz,
        attempts       int NOT NULL DEFAULT 0,
        last_error     text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX outbox_processed_at_created_at_idx ON outbox (processed_at, created_at)`,
    );

    // ── payment (TenantScopedEntity) ───────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partially_refunded', 'refunded', 'failed', 'canceled')`,
    );
    await queryRunner.query(`
      CREATE TABLE payment (
        id              text PRIMARY KEY,
        store_id        text NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        order_id        text NOT NULL,
        provider        text NOT NULL DEFAULT 'mock',
        method_brand    text,
        method_last4    text,
        amount_minor    bigint NOT NULL,
        currency        char(3) NOT NULL DEFAULT 'USD',
        status          payment_status NOT NULL DEFAULT 'pending',
        external_ref    text,
        idempotency_key text,
        client_secret   text
      )
    `);
    await queryRunner.query(`CREATE INDEX payment_store_id_idx ON payment (store_id)`);
    await queryRunner.query(`CREATE INDEX payment_order_id_idx ON payment (order_id)`);
    // Unique but not NOT NULL — Postgres unique indexes allow unlimited NULLs
    // (same pattern as inventory's reservation.idempotency_key).
    await queryRunner.query(
      `CREATE UNIQUE INDEX payment_idempotency_key_uq ON payment (idempotency_key)`,
    );

    // ── refund_execution (TenantScopedEntity; payment is a real NOT NULL FK) ──
    await queryRunner.query(
      `CREATE TYPE refund_execution_status AS ENUM ('processing', 'succeeded', 'failed')`,
    );
    await queryRunner.query(`
      CREATE TABLE refund_execution (
        id              text PRIMARY KEY,
        store_id        text NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        payment_id      text NOT NULL REFERENCES payment(id) ON DELETE RESTRICT,
        refund_id       text NOT NULL,
        order_id        text NOT NULL,
        amount_minor    bigint NOT NULL,
        status          refund_execution_status NOT NULL DEFAULT 'processing',
        provider_ref    text,
        failure_reason  text,
        idempotency_key text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX refund_execution_store_id_idx ON refund_execution (store_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX refund_execution_payment_id_idx ON refund_execution (payment_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX refund_execution_refund_id_idx ON refund_execution (refund_id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX refund_execution_idempotency_key_uq ON refund_execution (idempotency_key)`,
    );

    // ── webhook_inbox (BaseEntity — no store_id, see entity's doc comment) ──
    await queryRunner.query(`
      CREATE TABLE webhook_inbox (
        id                text PRIMARY KEY,
        provider          text NOT NULL,
        external_event_id text NOT NULL,
        payload_json      jsonb NOT NULL,
        received_at       timestamptz NOT NULL DEFAULT now(),
        processed_at      timestamptz,
        processing_error  text
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX webhook_inbox_provider_external_event_id_uq ON webhook_inbox (provider, external_event_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS webhook_inbox`);
    await queryRunner.query(`DROP TABLE IF EXISTS refund_execution`);
    await queryRunner.query(`DROP TYPE IF EXISTS refund_execution_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment`);
    await queryRunner.query(`DROP TYPE IF EXISTS payment_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox`);
  }
}

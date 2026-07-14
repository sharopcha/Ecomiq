import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox
 * — same constraint as every other service's Init migration) initial
 * schema for marketing_db — mirrors every entity under
 * `apps/services/marketing/src/app/entities/*` plus the shared
 * `OutboxMessage` (`@temp-nx/typeorm`).
 *
 * `discount_usage.discount_id` is NOT NULL, matching the entity's explicit
 * `@ManyToOne(() => Discount, { nullable: false, ... })` — same
 * explicit-nullable-false-is-honored reasoning verified in payment_db's
 * own init migration (the ManyToOne-defaults-to-nullable-true repo rule
 * only bites when `nullable` is *omitted*).
 */
export class InitMarketingDiscounts1751800000020 implements MigrationInterface {
  name = 'InitMarketingDiscounts1751800000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── outbox (BaseEntity + OutboxMessage columns — identical shape to every other service's) ──
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

    // ── discount (TenantScopedEntity) ──────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE discount_kind AS ENUM ('percentage', 'fixed_amount', 'free_shipping')`,
    );
    await queryRunner.query(
      `CREATE TYPE discount_status AS ENUM ('draft', 'active', 'expired', 'archived')`,
    );
    await queryRunner.query(`
      CREATE TABLE discount (
        id                text PRIMARY KEY,
        store_id          text NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        code              text NOT NULL,
        kind              discount_kind NOT NULL,
        value             int NOT NULL,
        usage_limit       int,
        usage_count       int NOT NULL DEFAULT 0,
        once_per_customer boolean NOT NULL DEFAULT false,
        starts_at         timestamptz,
        ends_at           timestamptz,
        status            discount_status NOT NULL DEFAULT 'draft',
        min_subtotal_minor bigint,
        UNIQUE (store_id, code)
      )
    `);
    await queryRunner.query(`CREATE INDEX discount_store_id_idx ON discount (store_id)`);

    // ── discount_usage (BaseEntity + manual store_id, no updated_at) ───────
    await queryRunner.query(`
      CREATE TABLE discount_usage (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        discount_id text NOT NULL REFERENCES discount(id) ON DELETE RESTRICT,
        order_id    text NOT NULL,
        customer_id text,
        used_at     timestamptz NOT NULL DEFAULT now(),
        UNIQUE (discount_id, order_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX discount_usage_store_id_idx ON discount_usage (store_id)`);
    await queryRunner.query(
      `CREATE INDEX discount_usage_discount_id_idx ON discount_usage (discount_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX discount_usage_customer_id_idx ON discount_usage (customer_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS discount_usage`);
    await queryRunner.query(`DROP TABLE IF EXISTS discount`);
    await queryRunner.query(`DROP TYPE IF EXISTS discount_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS discount_kind`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox`);
  }
}

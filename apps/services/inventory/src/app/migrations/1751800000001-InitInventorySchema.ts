import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox
 * — same constraint as identity's `InitIdentitySchema` / catalog's
 * `InitCatalogSchema`) initial schema for inventory_db — mirrors every
 * entity under `apps/services/inventory/src/app/entities/*` plus the
 * shared `OutboxMessage` (`@temp-nx/typeorm`), including
 * `reservation.idempotency_key`.
 *
 * Table order follows FK dependency order so `up()` never references a
 * not-yet-created table; `down()` drops in the reverse order for the same
 * reason. Timestamped with a later value than catalog's Init migration
 * (1751800000001 vs. 1751800000000) purely for a deterministic, readable
 * ordering if both ever ran against the same TypeORM CLI invocation — they
 * target entirely separate databases (ADR-2) so run order between them
 * never actually matters.
 *
 * `stock_level.location_id`, `stock_movement.stock_level_id`,
 * `stock_audit.stock_level_id`, and `reservation.stock_level_id` are nullable
 * here even though their entity fields are non-optional in TypeScript
 * (`location!: Location`, `stockLevel!: StockLevel`) — confirmed against a
 * real `synchronize` run, not assumed: none of those `@ManyToOne` decorators
 * pass `nullable: false`, and TypeORM's default for a relation-derived join
 * column is `nullable: true` regardless of the TS field's optionality.
 * Reproducing that (not "fixing" it to NOT NULL) is the whole point here.
 */
export class InitInventorySchema1751800000001 implements MigrationInterface {
  name = 'InitInventorySchema1751800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── outbox (BaseEntity + OutboxMessage columns — identical shape to catalog's) ──
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

    // ── Warehouses (TenantScopedEntity) ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE location (
        id            text PRIMARY KEY,
        store_id      text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        name          text NOT NULL,
        is_active     boolean NOT NULL DEFAULT true,
        is_default    boolean NOT NULL DEFAULT false,
        address_line1 text,
        address_line2 text,
        city          text,
        region        text,
        postal_code   text,
        country_code  char(2)
      )
    `);
    await queryRunner.query(`CREATE INDEX location_store_id_idx ON location (store_id)`);

    // ── Catalog read-model mirrors (TenantScopedEntity; id reuses catalog's own product/variant id, no FK to any table here) ──
    await queryRunner.query(`
      CREATE TABLE catalog_product_snapshot (
        id               text PRIMARY KEY,
        store_id         text NOT NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        display_number   int,
        name             text NOT NULL,
        sku              text,
        status           text NOT NULL,
        kind             text,
        category_id      text,
        category_name    text,
        price_minor      bigint,
        compare_at_minor bigint,
        archived_at      timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX catalog_product_snapshot_store_id_idx ON catalog_product_snapshot (store_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE catalog_variant_snapshot (
        id               text PRIMARY KEY,
        store_id         text NOT NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        product_id       text NOT NULL,
        sku              text NOT NULL,
        price_minor      bigint,
        is_active        boolean NOT NULL DEFAULT true,
        is_default       boolean NOT NULL DEFAULT false,
        image_file_id    text,
        deleted_at       timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX catalog_variant_snapshot_store_id_idx ON catalog_variant_snapshot (store_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX catalog_variant_snapshot_product_id_idx ON catalog_variant_snapshot (product_id)`,
    );

    // ── The inventory cell (TenantScopedEntity; location is a real FK, variant_id is not) ──
    await queryRunner.query(`
      CREATE TABLE stock_level (
        id              text PRIMARY KEY,
        store_id        text NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        variant_id      text NOT NULL,
        location_id     text REFERENCES location(id) ON DELETE RESTRICT,
        on_hand         int NOT NULL DEFAULT 0,
        reserved        int NOT NULL DEFAULT 0,
        low_threshold   int,
        unit_cost_minor bigint,
        UNIQUE (variant_id, location_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX stock_level_store_id_idx ON stock_level (store_id)`);
    await queryRunner.query(`CREATE INDEX stock_level_variant_id_idx ON stock_level (variant_id)`);

    // ── Append-only ledger (BaseEntity + manual store_id, no updated_at) ──
    await queryRunner.query(
      `CREATE TYPE stock_movement_kind AS ENUM ('sale', 'return', 'purchase_receipt', 'adjustment', 'reservation', 'release', 'transfer')`,
    );
    await queryRunner.query(`
      CREATE TABLE stock_movement (
        id             text PRIMARY KEY,
        store_id       text NOT NULL,
        stock_level_id text REFERENCES stock_level(id) ON DELETE RESTRICT,
        kind           stock_movement_kind NOT NULL,
        qty_delta      int NOT NULL,
        ref_table      text,
        ref_id         text,
        actor_id       text,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX stock_movement_store_id_idx ON stock_movement (store_id)`);
    await queryRunner.query(
      `CREATE INDEX stock_movement_stock_level_id_idx ON stock_movement (stock_level_id)`,
    );

    // ── Audit Stock modal submissions (BaseEntity + manual store_id, no updated_at) ──
    await queryRunner.query(`CREATE TYPE stock_adjust_type AS ENUM ('quantity', 'value')`);
    await queryRunner.query(
      `CREATE TYPE stock_adjust_reason AS ENUM ('damage', 'expire', 'misplacement', 'thief', 'stocktake_variance', 'custom')`,
    );
    await queryRunner.query(`
      CREATE TABLE stock_audit (
        id                text PRIMARY KEY,
        store_id          text NOT NULL,
        stock_level_id    text REFERENCES stock_level(id) ON DELETE RESTRICT,
        adjust_type       stock_adjust_type NOT NULL DEFAULT 'quantity',
        physical_count    int,
        available_before  int,
        discrepancy       int,
        value_delta_minor bigint,
        reason            stock_adjust_reason NOT NULL,
        note              text,
        actor_id          text,
        created_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX stock_audit_store_id_idx ON stock_audit (store_id)`);
    await queryRunner.query(
      `CREATE INDEX stock_audit_stock_level_id_idx ON stock_audit (stock_level_id)`,
    );

    // ── Create Stock Alert subscriptions (TenantScopedEntity) ─────────────
    await queryRunner.query(
      `CREATE TYPE alert_operator AS ENUM ('lower_than', 'greater_than', 'equals')`,
    );
    await queryRunner.query(
      `CREATE TYPE alert_action AS ENUM ('send_email', 'send_inbox', 'send_sms', 'create_task')`,
    );
    await queryRunner.query(`
      CREATE TABLE stock_alert (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        variant_id  text NOT NULL,
        location_id text,
        threshold   int NOT NULL,
        direction   alert_operator NOT NULL DEFAULT 'lower_than',
        actions     alert_action[] NOT NULL DEFAULT '{send_email}',
        is_active   boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`CREATE INDEX stock_alert_store_id_idx ON stock_alert (store_id)`);
    await queryRunner.query(`CREATE INDEX stock_alert_variant_id_idx ON stock_alert (variant_id)`);
    await queryRunner.query(`CREATE INDEX stock_alert_location_id_idx ON stock_alert (location_id)`);

    // ── Reservations (TenantScopedEntity) ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE reservation (
        id               text PRIMARY KEY,
        store_id         text NOT NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        stock_level_id   text REFERENCES stock_level(id) ON DELETE RESTRICT,
        order_id         text,
        order_line_id    text,
        qty              int NOT NULL,
        reserved_until   timestamptz NOT NULL,
        released_at      timestamptz,
        idempotency_key  text
      )
    `);
    await queryRunner.query(`CREATE INDEX reservation_store_id_idx ON reservation (store_id)`);
    await queryRunner.query(
      `CREATE INDEX reservation_stock_level_id_idx ON reservation (stock_level_id)`,
    );
    // Unique but not NOT NULL — Postgres unique indexes allow unlimited NULLs,
    // so REST-created reservations (which never set this) don't collide with
    // each other or with gRPC-created ones.
    await queryRunner.query(
      `CREATE UNIQUE INDEX reservation_idempotency_key_uq ON reservation (idempotency_key)`,
    );

    // ── Set Automatic Reorder rules (TenantScopedEntity) ──────────────────
    await queryRunner.query(
      `CREATE TYPE reorder_method AS ENUM ('purchase_order', 'manual', 'dropship')`,
    );
    await queryRunner.query(`
      CREATE TABLE reorder_rule (
        id                    text PRIMARY KEY,
        store_id              text NOT NULL,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        variant_id            text NOT NULL,
        location_id           text,
        method                reorder_method NOT NULL DEFAULT 'purchase_order',
        trigger_level         int NOT NULL,
        reorder_qty           int NOT NULL,
        preferred_supplier_id text,
        lead_time_days        int,
        is_active             boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`CREATE INDEX reorder_rule_store_id_idx ON reorder_rule (store_id)`);
    await queryRunner.query(`CREATE INDEX reorder_rule_variant_id_idx ON reorder_rule (variant_id)`);
    await queryRunner.query(
      `CREATE INDEX reorder_rule_location_id_idx ON reorder_rule (location_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reorder_rule`);
    await queryRunner.query(`DROP TYPE IF EXISTS reorder_method`);
    await queryRunner.query(`DROP TABLE IF EXISTS reservation`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_alert`);
    await queryRunner.query(`DROP TYPE IF EXISTS alert_action`);
    await queryRunner.query(`DROP TYPE IF EXISTS alert_operator`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_audit`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_adjust_reason`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_adjust_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movement`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_movement_kind`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_level`);
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_variant_snapshot`);
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_product_snapshot`);
    await queryRunner.query(`DROP TABLE IF EXISTS location`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox`);
  }
}

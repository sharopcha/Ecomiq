import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox
 * — same constraint as every other service's Init migration) initial
 * schema for order_db — the largest schema in this repo, mirroring every
 * entity under `apps/services/order/src/app/entities/*` plus the shared
 * `OutboxMessage` (`@temp-nx/typeorm`).
 *
 * `"order"` is quoted throughout (reserved SQL word) — see
 * `order.entity.ts`'s doc comment. Table order follows FK dependency order
 * so `up()` never references a not-yet-created table; `down()` drops in
 * the reverse order for the same reason.
 *
 * Known, accepted diff vs. a `synchronize` run: `order`'s
 * `(store_id, order_date)` index is created here as
 * `(store_id, order_date DESC)` — TypeORM's `@Index` decorator has no way
 * to express per-column sort direction, so `synchronize:true` can only
 * produce the plain-ascending form. See `order.entity.ts`'s doc comment.
 *
 * Real diff this migration caught on the first run: every `bigint`
 * column with a numeric default
 * (`order.*_minor`, `refund.amount_minor`) must be written as
 * `DEFAULT '0'::bigint`, not bare `DEFAULT 0` — Postgres normalizes a
 * plain integer-literal default on a `bigint` column to the cast form in
 * `information_schema.column_default`, and a bare `DEFAULT 0` doesn't
 * match that canonical form even though both produce an identical runtime
 * default value. No prior migration in this repo had hit this combination
 * (existing `bigint` money columns were all either nullable-with-no-default,
 * like `payment.amount_minor`, or plain `int` counters with `DEFAULT 0`,
 * which Postgres does *not* re-cast).
 */
export class InitOrderSchema1751800000030 implements MigrationInterface {
  name = 'InitOrderSchema1751800000030';

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

    // ── order (TenantScopedEntity) ──────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE order_channel_type AS ENUM ('online_store', 'pos', 'manual', 'marketplace', 'mobile_app')`,
    );
    await queryRunner.query(`CREATE TYPE order_status AS ENUM ('draft', 'open', 'completed', 'canceled')`);
    await queryRunner.query(
      `CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partially_refunded', 'refunded', 'failed', 'canceled')`,
    );
    await queryRunner.query(
      `CREATE TYPE fulfillment_status AS ENUM ('unfulfilled', 'partially_fulfilled', 'fulfilled', 'canceled')`,
    );
    await queryRunner.query(
      `CREATE TYPE order_stage AS ENUM ('review_order', 'preparing_order', 'shipping', 'delivered')`,
    );
    await queryRunner.query(`
      CREATE TABLE "order" (
        id                      text PRIMARY KEY,
        store_id                text NOT NULL,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        display_number          int NOT NULL,
        customer_id             text,
        channel_id              text,
        channel_type            order_channel_type NOT NULL DEFAULT 'online_store',
        status                  order_status NOT NULL DEFAULT 'open',
        payment_status          payment_status NOT NULL DEFAULT 'pending',
        fulfillment_status      fulfillment_status NOT NULL DEFAULT 'unfulfilled',
        stage                   order_stage NOT NULL DEFAULT 'review_order',
        order_date              timestamptz NOT NULL DEFAULT now(),
        estimated_arrival_start date,
        estimated_arrival_end   date,
        subtotal_minor          bigint NOT NULL DEFAULT '0'::bigint,
        shipping_type           text,
        shipping_fee_minor      bigint NOT NULL DEFAULT '0'::bigint,
        discount_minor          bigint NOT NULL DEFAULT '0'::bigint,
        tax_minor               bigint NOT NULL DEFAULT '0'::bigint,
        total_minor             bigint NOT NULL DEFAULT '0'::bigint,
        currency                char(3) NOT NULL DEFAULT 'USD',
        note                    text,
        shipping_address        jsonb,
        contact_email           text,
        contact_phone           text,
        canceled_at             timestamptz,
        cancel_reason           text,
        discount_id             text,
        discount_code           text,
        UNIQUE (store_id, display_number)
      )
    `);
    await queryRunner.query(`CREATE INDEX order_store_id_idx ON "order" (store_id)`);
    // DESC — see class doc comment for why this diffs from a synchronize run.
    await queryRunner.query(`CREATE INDEX order_store_id_order_date_idx ON "order" (store_id, order_date DESC)`);
    await queryRunner.query(
      `CREATE INDEX order_store_id_payment_status_fulfillment_status_idx ON "order" (store_id, payment_status, fulfillment_status)`,
    );

    // ── order_line (BaseEntity) ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE order_line (
        id              text PRIMARY KEY,
        order_id        text NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
        variant_id      text NOT NULL,
        name            text NOT NULL,
        sku             text,
        variant_label   text,
        qty             int NOT NULL,
        unit_price_minor bigint NOT NULL,
        image_file_id   text,
        reservation_id  text
      )
    `);
    await queryRunner.query(`CREATE INDEX order_line_order_id_idx ON order_line (order_id)`);
    await queryRunner.query(`CREATE INDEX order_line_variant_id_idx ON order_line (variant_id)`);
    await queryRunner.query(`CREATE INDEX order_line_reservation_id_idx ON order_line (reservation_id)`);

    // ── order_tag (composite PK, no id) ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE order_tag (
        order_id text NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
        tag_id   text NOT NULL,
        PRIMARY KEY (order_id, tag_id)
      )
    `);

    // ── invoice (BaseEntity + manual store_id, no updated_at) ───────────────
    await queryRunner.query(`
      CREATE TABLE invoice (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        order_id   text NOT NULL REFERENCES "order"(id) ON DELETE RESTRICT,
        display_id text NOT NULL,
        issued_at  timestamptz NOT NULL DEFAULT now(),
        totals     jsonb NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX invoice_store_id_idx ON invoice (store_id)`);
    await queryRunner.query(`CREATE INDEX invoice_order_id_idx ON invoice (order_id)`);

    // ── comment (BaseEntity + manual store_id, polymorphic, no updated_at) ──
    await queryRunner.query(`CREATE TYPE comment_visibility AS ENUM ('staff_only', 'public')`);
    await queryRunner.query(`
      CREATE TABLE comment (
        id                   text PRIMARY KEY,
        store_id             text NOT NULL,
        subject_table        text NOT NULL,
        subject_id           text NOT NULL,
        author_id            text,
        body                 text NOT NULL,
        attachment_file_ids  text[],
        visibility           comment_visibility NOT NULL DEFAULT 'staff_only',
        created_at           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX comment_store_id_idx ON comment (store_id)`);
    await queryRunner.query(
      `CREATE INDEX comment_subject_table_subject_id_created_at_idx ON comment (subject_table, subject_id, created_at)`,
    );

    // ── activity_log (BaseEntity + manual store_id, polymorphic, no updated_at) ──
    await queryRunner.query(`
      CREATE TABLE activity_log (
        id            text PRIMARY KEY,
        store_id      text NOT NULL,
        subject_table text NOT NULL,
        subject_id    text NOT NULL,
        actor_id      text,
        actor_kind    text NOT NULL DEFAULT 'user',
        verb          text NOT NULL,
        data          jsonb,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX activity_log_store_id_idx ON activity_log (store_id)`);
    await queryRunner.query(
      `CREATE INDEX activity_log_subject_table_subject_id_created_at_idx ON activity_log (subject_table, subject_id, created_at)`,
    );

    // ── return_request (BaseEntity + manual store_id, no updated_at) ────────
    await queryRunner.query(
      `CREATE TYPE return_status AS ENUM ('pending_approval', 'approved', 'rejected', 'expired', 'resolved')`,
    );
    await queryRunner.query(`CREATE TYPE return_shipping AS ENUM ('none', 'sending', 'delivered', 'received')`);
    await queryRunner.query(`
      CREATE TABLE return_request (
        id              text PRIMARY KEY,
        store_id        text NOT NULL,
        display_id      text NOT NULL,
        order_id        text NOT NULL REFERENCES "order"(id) ON DELETE RESTRICT,
        customer_id     text,
        status          return_status NOT NULL DEFAULT 'pending_approval',
        shipping_status return_shipping NOT NULL DEFAULT 'none',
        reason          text,
        requested_at    timestamptz NOT NULL DEFAULT now(),
        approved_at     timestamptz,
        rejected_at     timestamptz,
        resolved_at     timestamptz,
        expires_at      timestamptz,
        inspected       boolean NOT NULL DEFAULT false,
        note            text,
        UNIQUE (store_id, display_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX return_request_store_id_idx ON return_request (store_id)`);
    await queryRunner.query(`CREATE INDEX return_request_order_id_idx ON return_request (order_id)`);

    // ── return_line (BaseEntity) ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE return_line (
        id            text PRIMARY KEY,
        return_id     text NOT NULL REFERENCES return_request(id) ON DELETE CASCADE,
        order_line_id text NOT NULL REFERENCES order_line(id) ON DELETE RESTRICT,
        qty           int NOT NULL DEFAULT 1
      )
    `);
    await queryRunner.query(`CREATE INDEX return_line_return_id_idx ON return_line (return_id)`);
    await queryRunner.query(`CREATE INDEX return_line_order_line_id_idx ON return_line (order_line_id)`);

    // ── return_proof (BaseEntity) ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE return_proof (
        id        text PRIMARY KEY,
        return_id text NOT NULL REFERENCES return_request(id) ON DELETE CASCADE,
        file_id   text NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX return_proof_return_id_idx ON return_proof (return_id)`);

    // ── refund (BaseEntity + manual store_id, no updated_at) ─────────────────
    await queryRunner.query(`CREATE TYPE refund_type AS ENUM ('full', 'partial', 'none')`);
    await queryRunner.query(
      `CREATE TYPE refund_status AS ENUM ('requested', 'processing', 'refunded', 'declined', 'not_refunded')`,
    );
    await queryRunner.query(`
      CREATE TABLE refund (
        id                     text PRIMARY KEY,
        store_id               text NOT NULL,
        return_id              text REFERENCES return_request(id) ON DELETE RESTRICT,
        order_id               text NOT NULL REFERENCES "order"(id) ON DELETE RESTRICT,
        payment_id             text,
        refund_type            refund_type NOT NULL,
        amount_minor           bigint NOT NULL DEFAULT '0'::bigint,
        reason                 text,
        message_to_customer    text,
        send_info_to_customer  boolean NOT NULL DEFAULT true,
        status                 refund_status NOT NULL DEFAULT 'requested',
        created_at             timestamptz NOT NULL DEFAULT now(),
        refunded_at            timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX refund_store_id_idx ON refund (store_id)`);
    await queryRunner.query(`CREATE INDEX refund_return_id_idx ON refund (return_id)`);
    await queryRunner.query(`CREATE INDEX refund_order_id_idx ON refund (order_id)`);

    // ── store_sequence (composite PK, no id) ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE store_sequence (
        store_id   text NOT NULL,
        kind       text NOT NULL,
        next_value int NOT NULL DEFAULT 1,
        PRIMARY KEY (store_id, kind)
      )
    `);

    // ── saga_state (BaseEntity + manual store_id) ────────────────────────────
    await queryRunner.query(`CREATE TYPE saga_type AS ENUM ('checkout', 'refund')`);
    await queryRunner.query(`CREATE TYPE saga_status AS ENUM ('running', 'compensating', 'completed', 'failed')`);
    await queryRunner.query(`
      CREATE TABLE saga_state (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        order_id   text NOT NULL REFERENCES "order"(id) ON DELETE RESTRICT,
        saga_type  saga_type NOT NULL,
        step       text NOT NULL,
        status     saga_status NOT NULL DEFAULT 'running',
        payload    jsonb NOT NULL DEFAULT '{}',
        started_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        timeout_at timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX saga_state_store_id_idx ON saga_state (store_id)`);
    await queryRunner.query(`CREATE INDEX saga_state_order_id_idx ON saga_state (order_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS saga_state`);
    await queryRunner.query(`DROP TYPE IF EXISTS saga_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS saga_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_sequence`);
    await queryRunner.query(`DROP TABLE IF EXISTS refund`);
    await queryRunner.query(`DROP TYPE IF EXISTS refund_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS refund_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS return_proof`);
    await queryRunner.query(`DROP TABLE IF EXISTS return_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS return_request`);
    await queryRunner.query(`DROP TYPE IF EXISTS return_shipping`);
    await queryRunner.query(`DROP TYPE IF EXISTS return_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS activity_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS comment`);
    await queryRunner.query(`DROP TYPE IF EXISTS comment_visibility`);
    await queryRunner.query(`DROP TABLE IF EXISTS invoice`);
    await queryRunner.query(`DROP TABLE IF EXISTS order_tag`);
    await queryRunner.query(`DROP TABLE IF EXISTS order_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order"`);
    await queryRunner.query(`DROP TYPE IF EXISTS order_stage`);
    await queryRunner.query(`DROP TYPE IF EXISTS fulfillment_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS payment_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS order_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS order_channel_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox`);
  }
}

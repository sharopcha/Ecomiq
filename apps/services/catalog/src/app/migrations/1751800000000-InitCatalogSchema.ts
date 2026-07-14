import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox
 * — same constraint as identity's `InitIdentitySchema`) initial schema for
 * catalog_db — mirrors every entity under
 * `apps/services/catalog/src/app/entities/*` plus the shared
 * `OutboxMessage` (`@temp-nx/typeorm`).
 *
 * Column/constraint shapes here are taken directly from each entity's
 * decorators (types, defaults, nullability, FK `onDelete`, unique
 * constraints), not guessed — this is meant to produce the same schema
 * `synchronize: true` produces in dev, since that's what makes this
 * migration a safe drop-in for `synchronize: false` in production (the
 * acceptance bar: an empty DB + `migration:run` matches an empty DB +
 * `synchronize` in dev, checked via `\d`/adminer diff).
 *
 * Table order follows FK dependency order so `up()` never references a
 * not-yet-created table; `down()` drops in the reverse order for the same
 * reason.
 *
 * A few FK columns (product_option.product_id, product_option_value.option_id,
 * product_variant.product_id, product_image.product_id, license_key.product_id)
 * are nullable here even though their entity fields are declared non-optional
 * in TypeScript (`product!: Product`) — confirmed against a real `synchronize`
 * run rather than assumed: none of those `@ManyToOne` decorators pass
 * `nullable: false`, and TypeORM's default for a relation-derived join column
 * is `nullable: true` regardless of the TS field's own optionality. Matching
 * that (rather than "fixing" it to NOT NULL) is the point here — this
 * migration has to reproduce what `synchronize` already does in dev, not
 * what the entity *looks* like it should do.
 */
export class InitCatalogSchema1751800000000 implements MigrationInterface {
  name = 'InitCatalogSchema1751800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    // ── outbox (BaseEntity + OutboxMessage columns) ──────────────────────
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

    // ── Taxonomy (all TenantScopedEntity: id/store_id/created_at/updated_at + own columns) ──
    await queryRunner.query(`
      CREATE TABLE vendor (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        name       text NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX vendor_store_id_idx ON vendor (store_id)`);

    await queryRunner.query(`
      CREATE TABLE category (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        name       text NOT NULL,
        parent_id  text REFERENCES category(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX category_store_id_idx ON category (store_id)`);

    await queryRunner.query(`CREATE TYPE order_channel_type AS ENUM ('online_store', 'pos', 'manual', 'marketplace', 'mobile_app')`);
    await queryRunner.query(`
      CREATE TABLE channel (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        name       text NOT NULL,
        kind       order_channel_type NOT NULL DEFAULT 'online_store'
      )
    `);
    await queryRunner.query(`CREATE INDEX channel_store_id_idx ON channel (store_id)`);

    await queryRunner.query(`
      CREATE TABLE product_type_lu (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        name       text NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX product_type_lu_store_id_idx ON product_type_lu (store_id)`);

    await queryRunner.query(`
      CREATE TABLE tag (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        name       citext NOT NULL,
        UNIQUE (store_id, name)
      )
    `);
    await queryRunner.query(`CREATE INDEX tag_store_id_idx ON tag (store_id)`);

    // ── Product core (TenantScopedSoftDeletableEntity) ───────────────────
    await queryRunner.query(`CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived', 'discontinued')`);
    await queryRunner.query(`CREATE TYPE product_kind AS ENUM ('physical', 'digital')`);
    await queryRunner.query(`
      CREATE TABLE product (
        id                     text PRIMARY KEY,
        store_id               text NOT NULL,
        created_at             timestamptz NOT NULL DEFAULT now(),
        updated_at             timestamptz NOT NULL DEFAULT now(),
        deleted_at             timestamptz,
        display_number         int NOT NULL,
        name                   text NOT NULL,
        description            text,
        status                 product_status NOT NULL DEFAULT 'draft',
        kind                   product_kind NOT NULL DEFAULT 'physical',
        sku                    text,
        category_id            text REFERENCES category(id) ON DELETE SET NULL,
        type_id                text REFERENCES product_type_lu(id) ON DELETE SET NULL,
        vendor_id              text REFERENCES vendor(id) ON DELETE SET NULL,
        price_minor            bigint,
        compare_at_minor       bigint,
        cost_minor             bigint,
        wholesale_min_minor    bigint,
        wholesale_max_minor    bigint,
        charge_tax             boolean NOT NULL DEFAULT false,
        weight_value           numeric(10,3),
        weight_unit            text NOT NULL DEFAULT 'kg',
        length_cm              numeric(10,2),
        width_cm               numeric(10,2),
        height_cm              numeric(10,2),
        ships_internationally  boolean NOT NULL DEFAULT false,
        continue_selling_oos   boolean NOT NULL DEFAULT false,
        is_dropship            boolean NOT NULL DEFAULT false,
        rating_avg             numeric(2,1),
        rating_count           int NOT NULL DEFAULT 0,
        search                 tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(sku,''))) STORED,
        UNIQUE (store_id, display_number)
      )
    `);
    await queryRunner.query(`CREATE INDEX product_store_id_idx ON product (store_id)`);
    await queryRunner.query(`CREATE INDEX product_search_idx ON product (search)`);

    // Plain @ManyToMany/@JoinTable join tables — TypeORM's default shape:
    // both FK columns NOT NULL + CASCADE, composite PK across both.
    // TypeORM's synchronize also adds a plain btree index on *each* FK column
    // of a @JoinTable, beyond the composite PK/unique index across both —
    // confirmed against a real synchronize run, added here to match (not
    // otherwise obvious from the entity decorators, which don't mention
    // these explicitly — they're @JoinTable's own default behavior).
    await queryRunner.query(`
      CREATE TABLE product_channel (
        product_id text NOT NULL REFERENCES product(id) ON DELETE CASCADE,
        channel_id text NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
        PRIMARY KEY (product_id, channel_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX product_channel_product_id_idx ON product_channel (product_id)`);
    await queryRunner.query(`CREATE INDEX product_channel_channel_id_idx ON product_channel (channel_id)`);

    await queryRunner.query(`
      CREATE TABLE product_tag (
        product_id text NOT NULL REFERENCES product(id) ON DELETE CASCADE,
        tag_id     text NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
        PRIMARY KEY (product_id, tag_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX product_tag_product_id_idx ON product_tag (product_id)`);
    await queryRunner.query(`CREATE INDEX product_tag_tag_id_idx ON product_tag (tag_id)`);

    // ── Variant system (TimestampedEntity — no store_id of their own; scoped transitively via product_id) ──
    await queryRunner.query(`
      CREATE TABLE product_option (
        id         text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        product_id text REFERENCES product(id) ON DELETE CASCADE,
        name       text NOT NULL,
        position   int NOT NULL DEFAULT 0,
        use_images boolean NOT NULL DEFAULT false
      )
    `);

    await queryRunner.query(`
      CREATE TABLE product_option_value (
        id            text PRIMARY KEY,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        option_id     text REFERENCES product_option(id) ON DELETE CASCADE,
        value         text NOT NULL,
        swatch        text,
        image_file_id text,
        position      int NOT NULL DEFAULT 0
      )
    `);

    await queryRunner.query(`
      CREATE TABLE product_variant (
        id            text PRIMARY KEY,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        product_id    text REFERENCES product(id) ON DELETE CASCADE,
        sku           text NOT NULL,
        price_minor   bigint,
        is_active     boolean NOT NULL DEFAULT true,
        is_default    boolean NOT NULL DEFAULT false,
        image_file_id text,
        UNIQUE (product_id, sku)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE variant_option_value (
        variant_id      text NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE,
        option_value_id text NOT NULL REFERENCES product_option_value(id) ON DELETE CASCADE,
        PRIMARY KEY (variant_id, option_value_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX variant_option_value_variant_id_idx ON variant_option_value (variant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX variant_option_value_option_value_id_idx ON variant_option_value (option_value_id)`,
    );

    // ── Product images (TimestampedEntity) ────────────────────────────
    await queryRunner.query(`
      CREATE TABLE product_image (
        id         text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        product_id text REFERENCES product(id) ON DELETE CASCADE,
        file_id    text NOT NULL,
        position   int NOT NULL DEFAULT 0
      )
    `);

    // ── Bundles + license keys ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE bundle (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        name        text NOT NULL,
        price_minor bigint
      )
    `);
    await queryRunner.query(`CREATE INDEX bundle_store_id_idx ON bundle (store_id)`);

    await queryRunner.query(`
      CREATE TABLE bundle_item (
        bundle_id  text NOT NULL REFERENCES bundle(id) ON DELETE CASCADE,
        variant_id text NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE,
        qty        int NOT NULL,
        PRIMARY KEY (bundle_id, variant_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE license_key (
        id            text PRIMARY KEY,
        store_id      text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        product_id    text REFERENCES product(id) ON DELETE CASCADE,
        key_value     text NOT NULL,
        order_line_id text,
        status        text NOT NULL DEFAULT 'available'
      )
    `);
    await queryRunner.query(`CREATE INDEX license_key_store_id_idx ON license_key (store_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS license_key`);
    await queryRunner.query(`DROP TABLE IF EXISTS bundle_item`);
    await queryRunner.query(`DROP TABLE IF EXISTS bundle`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_image`);
    await queryRunner.query(`DROP TABLE IF EXISTS variant_option_value`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_variant`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_option_value`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_option`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_tag`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_channel`);
    await queryRunner.query(`DROP TABLE IF EXISTS product`);
    await queryRunner.query(`DROP TYPE IF EXISTS product_kind`);
    await queryRunner.query(`DROP TYPE IF EXISTS product_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS tag`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_type_lu`);
    await queryRunner.query(`DROP TABLE IF EXISTS channel`);
    await queryRunner.query(`DROP TYPE IF EXISTS order_channel_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS category`);
    await queryRunner.query(`DROP TABLE IF EXISTS vendor`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox`);
  }
}

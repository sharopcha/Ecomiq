import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB was available to auto-generate via
 * `typeorm migration:generate` in the sandbox that produced this) initial
 * schema for identity_db — mirrors the core identity entities plus the
 * `invitation` / `api_key` tables. `saved_view` / `store_sequence` are also
 * identity-owned but are out of scope for this auth-only pass — added in a
 * follow-up migration once the workspaces that use them are being built.
 */
export class InitIdentitySchema1751700000000 implements MigrationInterface {
  name = 'InitIdentitySchema1751700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await queryRunner.query(`
      CREATE TABLE app_user (
        id              text PRIMARY KEY,
        email           citext UNIQUE NOT NULL,
        password_hash   text,
        full_name       text NOT NULL,
        avatar_file_id  text,
        totp_secret     text,
        totp_enabled    boolean NOT NULL DEFAULT false,
        google_id       text,
        email_verified_at timestamptz,
        last_login_at   timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX app_user_google_id_uq ON app_user (google_id) WHERE google_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE store (
        id                text PRIMARY KEY,
        name              text NOT NULL,
        slug              citext UNIQUE NOT NULL,
        logo_file_id      text,
        default_currency  char(3) NOT NULL DEFAULT 'USD',
        country_code      char(2),
        support_email     citext,
        plan              text NOT NULL DEFAULT 'trial',
        created_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE membership (
        id        text PRIMARY KEY,
        store_id  text NOT NULL REFERENCES store(id) ON DELETE CASCADE,
        user_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        role      text NOT NULL DEFAULT 'staff',
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (store_id, user_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX membership_user_id_idx ON membership (user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE invitation (
        id          text PRIMARY KEY,
        store_id    text NOT NULL REFERENCES store(id) ON DELETE CASCADE,
        email       citext NOT NULL,
        role        text NOT NULL DEFAULT 'staff',
        token_hash  text NOT NULL,
        invited_by  text REFERENCES app_user(id) ON DELETE SET NULL,
        status      text NOT NULL DEFAULT 'pending',
        expires_at  timestamptz NOT NULL,
        accepted_at timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX invitation_store_email_pending_uq
        ON invitation (store_id, email) WHERE status = 'pending'
    `);

    await queryRunner.query(`
      CREATE TABLE api_key (
        id          text PRIMARY KEY,
        store_id    text NOT NULL REFERENCES store(id) ON DELETE CASCADE,
        name        text NOT NULL,
        key_hash    text NOT NULL UNIQUE,
        key_prefix  text NOT NULL,
        created_by  text REFERENCES app_user(id) ON DELETE SET NULL,
        last_used_at timestamptz,
        revoked_at  timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS api_key`);
    await queryRunner.query(`DROP TABLE IF EXISTS invitation`);
    await queryRunner.query(`DROP TABLE IF EXISTS membership`);
    await queryRunner.query(`DROP TABLE IF EXISTS store`);
    await queryRunner.query(`DROP TABLE IF EXISTS app_user`);
  }
}

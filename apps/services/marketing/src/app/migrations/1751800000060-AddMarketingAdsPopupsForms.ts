import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written schema addition for `ad`/`popup`/`form`/`form_submission` —
 * same constraints as every other hand-authored migration in this repo
 * (no live DB to `migration:generate` against).
 *
 * `ad.campaign_id` and `form_submission.form_id` are NOT NULL, matching
 * their entities' explicit `{ nullable: false }` — same
 * explicit-nullable-false-is-honored reasoning as `discount_usage`/
 * `campaign_send`.
 */
export class AddMarketingAdsPopupsForms1751800000060 implements MigrationInterface {
  name = 'AddMarketingAdsPopupsForms1751800000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE ad_platform AS ENUM ('meta', 'google')`);
    await queryRunner.query(`
      CREATE TABLE ad (
        id           text PRIMARY KEY,
        store_id     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        campaign_id  text NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
        platform     ad_platform NOT NULL,
        audience     jsonb,
        budget_minor bigint NOT NULL DEFAULT '0'::bigint,
        starts_at    timestamptz,
        ends_at      timestamptz,
        stats        jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX ad_store_id_idx ON ad (store_id)`);
    await queryRunner.query(`CREATE INDEX ad_campaign_id_idx ON ad (campaign_id)`);

    await queryRunner.query(`CREATE TYPE popup_status AS ENUM ('draft', 'active', 'archived')`);
    await queryRunner.query(`
      CREATE TABLE popup (
        id             text PRIMARY KEY,
        store_id       text NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        schema         jsonb NOT NULL,
        display_rules  jsonb,
        status         popup_status NOT NULL DEFAULT 'draft'
      )
    `);
    await queryRunner.query(`CREATE INDEX popup_store_id_idx ON popup (store_id)`);

    await queryRunner.query(`CREATE TYPE form_status AS ENUM ('draft', 'active', 'archived')`);
    await queryRunner.query(`
      CREATE TABLE form (
        id           text PRIMARY KEY,
        store_id     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        schema       jsonb NOT NULL,
        status       form_status NOT NULL DEFAULT 'draft'
      )
    `);
    await queryRunner.query(`CREATE INDEX form_store_id_idx ON form (store_id)`);

    await queryRunner.query(`
      CREATE TABLE form_submission (
        id            text PRIMARY KEY,
        store_id      text NOT NULL,
        form_id       text NOT NULL REFERENCES form(id) ON DELETE CASCADE,
        data          jsonb NOT NULL,
        submitted_at  timestamptz NOT NULL DEFAULT now(),
        source_ip     text
      )
    `);
    await queryRunner.query(`CREATE INDEX form_submission_store_id_idx ON form_submission (store_id)`);
    await queryRunner.query(`CREATE INDEX form_submission_form_id_idx ON form_submission (form_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS form_submission`);
    await queryRunner.query(`DROP TABLE IF EXISTS form`);
    await queryRunner.query(`DROP TYPE IF EXISTS form_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS popup`);
    await queryRunner.query(`DROP TYPE IF EXISTS popup_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS ad`);
    await queryRunner.query(`DROP TYPE IF EXISTS ad_platform`);
  }
}

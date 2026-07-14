import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox —
 * same constraint as `InitMarketingDiscounts`) schema addition for
 * `campaign`/`campaign_send`.
 *
 * `campaign_send.campaign_id` is NOT NULL, matching the entity's explicit
 * `@ManyToOne(() => Campaign, { nullable: false, ... })` — same
 * explicit-nullable-false-is-honored reasoning as `discount_usage`.
 */
export class AddMarketingCampaigns1751800000030 implements MigrationInterface {
  name = 'AddMarketingCampaigns1751800000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE campaign_kind AS ENUM ('email', 'ads', 'popup', 'form', 'coupon')`,
    );
    await queryRunner.query(
      `CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'paused', 'archived')`,
    );
    await queryRunner.query(`
      CREATE TABLE campaign (
        id           text PRIMARY KEY,
        store_id     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        kind         campaign_kind NOT NULL,
        title        text NOT NULL,
        status       campaign_status NOT NULL DEFAULT 'draft',
        schedule_at  timestamptz,
        audience     jsonb,
        content_ref  jsonb,
        stats        jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX campaign_store_id_idx ON campaign (store_id)`);

    await queryRunner.query(`
      CREATE TABLE campaign_send (
        id          text PRIMARY KEY,
        store_id    text NOT NULL,
        campaign_id text NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
        recipient   text NOT NULL,
        customer_id text,
        sent_at     timestamptz,
        opened_at   timestamptz,
        clicked_at  timestamptz,
        bounced_at  timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX campaign_send_store_id_idx ON campaign_send (store_id)`);
    await queryRunner.query(
      `CREATE INDEX campaign_send_campaign_id_idx ON campaign_send (campaign_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX campaign_send_customer_id_idx ON campaign_send (customer_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS campaign_send`);
    await queryRunner.query(`DROP TABLE IF EXISTS campaign`);
    await queryRunner.query(`DROP TYPE IF EXISTS campaign_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS campaign_kind`);
  }
}

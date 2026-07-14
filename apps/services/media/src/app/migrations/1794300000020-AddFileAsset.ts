import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox
 * — same constraint as every other migration in this service) — adds
 * `file_asset` (ECOMIQ-DATA-MODEL.md §4) + the `file_source` enum.
 *
 * `owner_id` has no FK — `app_user` lives in identity-service's own
 * database (ADR-2), so a real cross-database FK isn't possible; see
 * `FileAsset`'s doc comment. `folder_id` FK is nullable (files can live at
 * the store's root, unfoldered) with no `ON DELETE` override — Postgres's
 * default RESTRICT, same reasoning as `file_folder.parent_id`: deleting a
 * folder that still contains files should fail loudly, not silently
 * orphan them, and `FoldersService.remove`'s empty-check (Step 4) already
 * enforces that at the application layer too.
 */
export class AddFileAsset1794300000020 implements MigrationInterface {
  name = 'AddFileAsset1794300000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE file_source AS ENUM ('upload', 'content_library', 'unsplash', 'ai_generated', 'dropbox', 'google_drive', 'one_drive')`,
    );

    await queryRunner.query(`
      CREATE TABLE file_asset (
        id               text PRIMARY KEY,
        store_id         text NOT NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        folder_id        text REFERENCES file_folder(id),
        owner_id         text,
        name             text NOT NULL,
        mime_type        text NOT NULL,
        size_bytes       bigint NOT NULL,
        storage_key      text NOT NULL,
        source           file_source NOT NULL DEFAULT 'upload',
        external_ref     text,
        duration_seconds int
      )
    `);
    await queryRunner.query(`CREATE INDEX file_asset_store_id_idx ON file_asset (store_id)`);
    await queryRunner.query(`CREATE INDEX file_asset_folder_id_idx ON file_asset (folder_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS file_asset`);
    await queryRunner.query(`DROP TYPE IF EXISTS file_source`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (no live DB to `migration:generate` against in this sandbox
 * — same constraint as every other service's migrations) — adds
 * `file_folder` (self-referential tree, `parent_id` at Postgres's default
 * RESTRICT so an app-level bug can't silently orphan a folder's children —
 * see `FileFolder`'s doc comment) and `activity_log` (this service's own
 * local copy of the polymorphic shape every other service already has —
 * `subjectTable`/`subjectId`, not a `kind` column).
 */
export class AddFileFolder1794300000010 implements MigrationInterface {
  name = 'AddFileFolder1794300000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE file_folder (
        id         text PRIMARY KEY,
        store_id   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        name       text NOT NULL,
        parent_id  text REFERENCES file_folder(id)
      )
    `);
    await queryRunner.query(`CREATE INDEX file_folder_store_id_idx ON file_folder (store_id)`);

    await queryRunner.query(`
      CREATE TABLE activity_log (
        id           text PRIMARY KEY,
        store_id     text NOT NULL,
        subject_table text NOT NULL,
        subject_id   text NOT NULL,
        actor_id     text,
        actor_kind   text NOT NULL DEFAULT 'user',
        verb         text NOT NULL,
        data         jsonb,
        created_at   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX activity_log_store_id_idx ON activity_log (store_id)`);
    await queryRunner.query(
      `CREATE INDEX activity_log_subject_table_subject_id_created_at_idx ON activity_log (subject_table, subject_id, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS activity_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS file_folder`);
  }
}

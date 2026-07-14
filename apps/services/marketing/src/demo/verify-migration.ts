/**
 * Migration-vs-synchronize schema diff for marketing_db — clone of
 * apps/services/payment/src/demo/verify-migration.ts's technique (real
 * docker-postgres throwaway databases, not embedded-postgres — see that
 * file's doc comment for why this repo uses this instead).
 *
 * Run:
 *   npm run marketing:verify-migration
 */
import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Discount } from '../app/entities/discount.entity';
import { DiscountUsage } from '../app/entities/discount-usage.entity';
import { Campaign } from '../app/entities/campaign.entity';
import { CampaignSend } from '../app/entities/campaign-send.entity';
import { Ad } from '../app/entities/ad.entity';
import { Popup } from '../app/entities/popup.entity';
import { Form } from '../app/entities/form.entity';
import { FormSubmission } from '../app/entities/form-submission.entity';
import { SegmentSnapshot } from '../app/entities/segment-snapshot.entity';

loadEnv();

const HOST = process.env.MARKETING_DB_HOST ?? 'localhost';
const PORT = Number(process.env.MARKETING_DB_PORT ?? 5432);
const USER = process.env.MARKETING_DB_USER ?? 'ecomiq';
const PASSWORD = process.env.MARKETING_DB_PASSWORD ?? 'ecomiq';
const BASE_DB = process.env.MARKETING_DB_NAME ?? 'marketing_db';
const MIGRATED_DB = `${BASE_DB}_verify_migrated`;
const SYNC_DB = `${BASE_DB}_verify_sync`;

const ENTITIES = [
  OutboxMessage,
  Discount,
  DiscountUsage,
  Campaign,
  CampaignSend,
  Ad,
  Popup,
  Form,
  FormSubmission,
  SegmentSnapshot,
];

async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: 'ecomiq' });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function dropDbIfExists(client: Client, name: string) {
  await client.query(`DROP DATABASE IF EXISTS ${name}`);
}

async function dumpSchema(dbName: string): Promise<string[]> {
  const client = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: dbName });
  await client.connect();
  try {
    const cols = await client.query(
      `SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') AS line
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name NOT IN ('migrations')
       ORDER BY 1`,
    );
    return cols.rows.map((r) => r.line as string);
  } finally {
    await client.end();
  }
}

async function main() {
  await withAdminClient(async (admin) => {
    await dropDbIfExists(admin, MIGRATED_DB);
    await dropDbIfExists(admin, SYNC_DB);
    await admin.query(`CREATE DATABASE ${MIGRATED_DB}`);
    await admin.query(`CREATE DATABASE ${SYNC_DB}`);
  });

  console.log(`[verify-migration] running migration up() against ${MIGRATED_DB}...`);
  const migratedDs = new DataSource({
    type: 'postgres',
    host: HOST,
    port: PORT,
    username: USER,
    password: PASSWORD,
    database: MIGRATED_DB,
    entities: ENTITIES,
    migrations: [__dirname + '/../app/migrations/*.{ts,js}'],
    synchronize: false,
  });
  await migratedDs.initialize();
  await migratedDs.runMigrations();
  const migratedDump = await dumpSchema(MIGRATED_DB);

  console.log('[verify-migration] running down() for every migration and asserting empty...');
  // `undoLastMigration()` only reverts the single most recent migration —
  // with 2+ migration files a single call leaves earlier migrations'
  // tables behind. Loop until the migrations table itself is empty so
  // this check stays correct regardless of how many files exist.
  let executedCount = (await migratedDs.query(`SELECT count(*)::int AS c FROM migrations`))[0].c;
  while (executedCount > 0) {
    await migratedDs.undoLastMigration();
    executedCount = (await migratedDs.query(`SELECT count(*)::int AS c FROM migrations`))[0].c;
  }
  const tablesAfterDown = await migratedDs.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name != 'migrations'`,
  );
  await migratedDs.destroy();
  if (tablesAfterDown.length > 0) {
    console.error('[verify-migration] FAIL: down() left tables behind:', tablesAfterDown);
    process.exitCode = 1;
  } else {
    console.log('[verify-migration] down() left the schema empty — OK.');
  }

  console.log(`[verify-migration] running synchronize:true against ${SYNC_DB}...`);
  const syncDs = new DataSource({
    type: 'postgres',
    host: HOST,
    port: PORT,
    username: USER,
    password: PASSWORD,
    database: SYNC_DB,
    entities: ENTITIES,
    synchronize: true,
  });
  await syncDs.initialize();
  const syncDump = await dumpSchema(SYNC_DB);
  await syncDs.destroy();

  await withAdminClient(async (admin) => {
    await dropDbIfExists(admin, MIGRATED_DB);
    await dropDbIfExists(admin, SYNC_DB);
  });

  const migratedSorted = [...migratedDump].sort();
  const syncSorted = [...syncDump].sort();
  const onlyInMigrated = migratedSorted.filter((l) => !syncSorted.includes(l));
  const onlyInSync = syncSorted.filter((l) => !migratedSorted.includes(l));

  if (onlyInMigrated.length === 0 && onlyInSync.length === 0) {
    console.log('MATCH');
  } else {
    console.error('[verify-migration] MISMATCH');
    console.error('Only in migration up():', onlyInMigrated);
    console.error('Only in synchronize:true:', onlyInSync);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[verify-migration] FAILED:', err);
  process.exitCode = 1;
});

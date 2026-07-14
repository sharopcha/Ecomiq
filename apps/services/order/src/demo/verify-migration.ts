/**
 * Migration-vs-synchronize schema diff for order_db — same
 * real-docker-postgres technique used for payment_db and marketing_db (see
 * either's data-source.ts doc comment for why this repo uses real Postgres
 * here instead of embedded-postgres). This is the largest schema in the
 * service — running the diff for real, instead of just eyeballing the
 * entities against the DDL, is the point.
 *
 * Run:
 *   npm run order:verify-migration
 */
import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Order } from '../app/entities/order.entity';
import { OrderLine } from '../app/entities/order-line.entity';
import { OrderTag } from '../app/entities/order-tag.entity';
import { Invoice } from '../app/entities/invoice.entity';
import { OrderComment } from '../app/entities/order-comment.entity';
import { ActivityLog } from '../app/entities/activity-log.entity';
import { ReturnRequest } from '../app/entities/return-request.entity';
import { ReturnLine } from '../app/entities/return-line.entity';
import { ReturnProof } from '../app/entities/return-proof.entity';
import { Refund } from '../app/entities/refund.entity';
import { StoreSequence } from '../app/entities/store-sequence.entity';
import { SagaState } from '../app/entities/saga-state.entity';
import { FulfillmentRollup } from '../app/entities/fulfillment-rollup.entity';

loadEnv();

const HOST = process.env.ORDER_DB_HOST ?? 'localhost';
const PORT = Number(process.env.ORDER_DB_PORT ?? 5432);
const USER = process.env.ORDER_DB_USER ?? 'ecomiq';
const PASSWORD = process.env.ORDER_DB_PASSWORD ?? 'ecomiq';
const BASE_DB = process.env.ORDER_DB_NAME ?? 'order_db';
const MIGRATED_DB = `${BASE_DB}_verify_migrated`;
const SYNC_DB = `${BASE_DB}_verify_sync`;

const ENTITIES = [
  OutboxMessage,
  Order,
  OrderLine,
  OrderTag,
  Invoice,
  OrderComment,
  ActivityLog,
  ReturnRequest,
  ReturnLine,
  ReturnProof,
  Refund,
  StoreSequence,
  SagaState,
  FulfillmentRollup,
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
  // with this service's 4 migration files, a single call leaves everything
  // but the last one's tables behind. Loop until the migrations table
  // itself is empty (same fix marketing's verify-migration needed, for the
  // same reason).
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

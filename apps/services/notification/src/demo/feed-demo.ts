/**
 * Runnable proof — boots the real Nest application context (real
 * `NotificationsService`, real Postgres via `notification_db`) and
 * exercises the in-app feed: push targeted + broadcast, visibility rules
 * (own + broadcast only, not another user's targeted rows), unread counts,
 * and mark-read idempotency (including the shared-read-receipt behavior on
 * broadcasts).
 *
 * Run:
 *   npm run notification:feed-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { NotificationsService } from '../app/notifications/notifications.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const userA = `demo-user-a-${ulid()}`;
  const userB = `demo-user-b-${ulid()}`;
  const notifications = app.get(NotificationsService);

  console.log('[feed-demo] pushing one targeted (userA) + one broadcast notification...');
  const targeted = await notifications.push(storeId, {
    userId: userA,
    kind: 'refund_failed_staff_alert',
    title: 'Refund failed',
    body: 'Refund for order 1042 failed.',
    refTable: 'refund_execution',
    refId: 'demo-refund-1',
  });
  const broadcast = await notifications.push(storeId, {
    kind: 'stock_low',
    title: 'Low stock',
    body: 'SKU HOODIE is running low.',
  });
  assert(targeted.userId === userA, 'targeted notification should carry userA as userId');
  assert(broadcast.userId === null, 'broadcast notification should have userId null');

  console.log('[feed-demo] userA sees both (targeted + broadcast)...');
  const feedA = await notifications.findFeed(storeId, userA, { offset: 0, limit: 20 });
  assert(feedA.total === 2, `userA should see 2 rows, got ${feedA.total}`);

  console.log('[feed-demo] userB sees only the broadcast, not userA\'s targeted row...');
  const feedB = await notifications.findFeed(storeId, userB, { offset: 0, limit: 20 });
  assert(feedB.total === 1, `userB should see 1 row, got ${feedB.total}`);
  assert(feedB.items[0].id === broadcast.id, "userB's one visible row should be the broadcast");

  console.log('[feed-demo] unread counts start at 2 (userA) and 1 (userB)...');
  assert((await notifications.unreadCount(storeId, userA)) === 2, 'userA unread count should be 2');
  assert((await notifications.unreadCount(storeId, userB)) === 1, 'userB unread count should be 1');

  console.log('[feed-demo] userA marks the targeted row read...');
  const marked = await notifications.markRead(storeId, userA, targeted.id);
  assert(marked.readAt !== null, 'markRead should set readAt');
  assert((await notifications.unreadCount(storeId, userA)) === 1, 'userA unread count should drop to 1');

  console.log('[feed-demo] marking the same row read again is a no-op (idempotent)...');
  const markedAgain = await notifications.markRead(storeId, userA, targeted.id);
  assert(markedAgain.readAt!.getTime() === marked.readAt!.getTime(), 'second markRead should not change readAt');

  console.log('[feed-demo] userB cannot mark userA\'s targeted row read (not visible to them)...');
  let rejected = false;
  try {
    await notifications.markRead(storeId, userB, targeted.id);
  } catch {
    rejected = true;
  }
  assert(rejected, "userB should get a not-found error marking userA's targeted row read");

  console.log('[feed-demo] userB marks the broadcast read — this is shared, so userA sees it read too...');
  await notifications.markRead(storeId, userB, broadcast.id);
  assert((await notifications.unreadCount(storeId, userB)) === 0, 'userB unread count should now be 0');
  assert(
    (await notifications.unreadCount(storeId, userA)) === 0,
    "userA's unread count should also drop to 0 — broadcast read_at is store-shared, not per-user",
  );

  console.log('[feed-demo] markAllRead on a fully-read feed is a 0-row no-op...');
  const allReadResult = await notifications.markAllRead(storeId, userA);
  assert(allReadResult.updated === 0, 'markAllRead should report 0 updated when nothing is unread');

  console.log('[feed-demo] pushing 3 more broadcasts then markAllRead in one shot...');
  await notifications.push(storeId, { kind: 'stock_low', title: 'Another low stock alert' });
  await notifications.push(storeId, { kind: 'stock_low', title: 'Yet another low stock alert' });
  await notifications.push(storeId, { kind: 'stock_low', title: 'One more low stock alert' });
  assert((await notifications.unreadCount(storeId, userA)) === 3, 'userA should have 3 unread after the new broadcasts');
  const bulkResult = await notifications.markAllRead(storeId, userA);
  assert(bulkResult.updated === 3, `markAllRead should report 3 updated, got ${bulkResult.updated}`);
  assert((await notifications.unreadCount(storeId, userA)) === 0, 'userA unread count should be 0 after markAllRead');

  console.log('[feed-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[feed-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[feed-demo] FAILED:', err);
  process.exit(1);
});

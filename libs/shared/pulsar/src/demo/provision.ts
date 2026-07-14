/**
 * CLI entry point: `npm run pulsar:provision`. Creates the "ecomiq" tenant,
 * every namespace a service needs, and every topic those namespaces'
 * consumers subscribe to — pre-creating topics removes a real
 * `TopicNotFound` startup race on a
 * genuinely fresh broker (see `ensurePulsarTopic`'s doc comment). Safe to
 * re-run — add a service's namespace/topics here the first time it starts
 * publishing/consuming (see that service's own <SERVICE>_PULSAR_NAMESPACE
 * var, e.g. CATALOG_PULSAR_NAMESPACE / INVENTORY_PULSAR_NAMESPACE, in its
 * .env block — each service reads its own key, not a shared generic one, so
 * namespaces don't collide when multiple services run side-by-side via
 * `nx serve` against one root .env).
 */
import { ensurePulsarNamespace, ensurePulsarTenant, ensurePulsarTopic } from '../lib/provision';

const adminUrl = process.env['PULSAR_ADMIN_URL'] ?? 'http://localhost:8080';
const tenant = process.env['PULSAR_TENANT'] ?? 'ecomiq';
const authToken = process.env['PULSAR_AUTH_TOKEN'];
const namespaces = ['catalog', 'inventory', 'orders', 'payments', 'marketing', 'notify', 'shipping', 'crm', 'purchasing', 'media'];

// The order/payment/marketing command + domain-event topics — catalog/
// inventory's own topics predate these and stay on the existing
// auto-creation-only path (namespaces above cover them).
const topics: Array<{ namespace: string; topic: string }> = [
  { namespace: 'orders', topic: 'order.events' },
  { namespace: 'orders', topic: 'return.events' },
  { namespace: 'payments', topic: 'payment.events' },
  { namespace: 'payments', topic: 'payment.commands' },
  { namespace: 'marketing', topic: 'discount.events' },
  { namespace: 'marketing', topic: 'campaign.events' },
  { namespace: 'marketing', topic: 'notify.commands' },
  // notification-service's own outbound domain events
  // (notify.message.sent/failed) and its self-consumed retry command
  // (Step 6) both land on this one topic.
  { namespace: 'notify', topic: 'message.events' },
  // shipping-service's four aggregate topics (§1 of ECOMIQ-SHIPPING-PLAN.md)
  // — each carries both its domain events and its own self-consumed delayed
  // message (shipment.events also carries shipment.delay_check, pickup.events
  // also carries pickup.reminder_check).
  { namespace: 'shipping', topic: 'shipment.events' },
  { namespace: 'shipping', topic: 'label.events' },
  { namespace: 'shipping', topic: 'fulfillment.events' },
  { namespace: 'shipping', topic: 'pickup.events' },
  // crm-service's four aggregate topics — customer/review/loyalty/segment
  // domain events, each on its own topic (no self-consumed delayed messages
  // here, unlike shipping's).
  { namespace: 'crm', topic: 'customer.events' },
  { namespace: 'crm', topic: 'review.events' },
  { namespace: 'crm', topic: 'loyalty.events' },
  { namespace: 'crm', topic: 'segment.events' },
  // purchasing-service's two aggregate topics — supplier/PO domain events,
  // each on its own topic (no self-consumed delayed messages here, unlike
  // shipping's).
  { namespace: 'purchasing', topic: 'supplier.events' },
  { namespace: 'purchasing', topic: 'po.events' },
  // media-service's single topic — every media.file.* event (created/
  // updated/deleted/imported) rides this one aggregate stream, no separate
  // per-aggregate split the way shipping/crm needed (media only has one
  // real aggregate, file_asset — file_folder changes aren't published).
  { namespace: 'media', topic: 'file.events' },
];

async function main() {
  await ensurePulsarTenant({ adminUrl, tenant, authToken });
  for (const namespace of namespaces) {
    await ensurePulsarNamespace({ adminUrl, tenant, namespace, authToken });
  }
  for (const { namespace, topic } of topics) {
    await ensurePulsarTopic({ adminUrl, tenant, namespace, topic, authToken });
  }
  console.log('[pulsar-provision] OK');
}

main().catch((err) => {
  console.error('[pulsar-provision] FAILED:', err);
  process.exit(1);
});

import { SendChannel } from '../entities/send-log.entity';
import { TemplateKind } from '../entities/email-template.entity';

export interface MappedDispatchInput {
  channel: SendChannel;
  recipient: string;
  templateKind: TemplateKind;
  vars: Record<string, string>;
  subjectOverride?: string;
  bodyOverride?: string;
  refTable?: string | null;
  refId?: string | null;
}

export type MapNotifyCommandResult =
  | { action: 'dispatch'; input: MappedDispatchInput }
  | { action: 'skip'; reason: string };

/** Only string/number/boolean values pass through — objects/arrays/null would otherwise stringify as `"[object Object]"` and pollute the rendered output. */
function flattenContentVars(content: unknown): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!content || typeof content !== 'object') return vars;
  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      vars[key] = String(value);
    }
  }
  return vars;
}

/**
 * Pure mapper from the `notify.send` command's payload shapes to
 * `DispatchService.dispatch()` inputs. Unknown `template` values are never
 * a hard failure — this service acks, logs, and moves on (forward
 * compatibility for payloads this service doesn't know about yet); the
 * caller (`NotifyCommandsController`) is what actually acks by returning
 * normally on a `'skip'` result rather than nack-looping.
 *
 * - `campaign` → email to `recipient`. `content` is genuinely free-form
 *   jsonb (`Campaign.contentRef`, no fixed schema) — every string/number/
 *   boolean value in it becomes a render var, so a store's own `campaign`
 *   kind template (or the built-in default, on a fresh store) picks up
 *   whatever it recognizes and leaves the rest missing-but-harmless.
 * - `refund` → honors `sendToCustomer === false` by skipping outright
 *   (dispatch nothing). Skips (rather than dispatching to a blank
 *   recipient) if the payload carries no `email` — order-service's
 *   `contactEmail` enrichment (added alongside this mapper) should always
 *   populate it, but a defensive skip beats sending to `""`. `message`
 *   (the merchant-authored `messageToCustomer`) is a body override, not a
 *   render var — it's already final text, not a template fragment.
 * - `refund_failed_staff_alert` → in-app broadcast (no external recipient,
 *   no `template_kind` fits an ad-hoc internal alert like this one), fully
 *   synthesized via subject/body overrides rather than a resolved template.
 * - `shipment` → channel-respecting (email/sms/whatsapp per the payload's
 *   own `channel` field), falling back to an in-app broadcast when the
 *   composer call carried no recipient. `subject`/`body` on the payload are
 *   already final composer-authored text, so they're overrides, not a
 *   resolved template's render vars (`OrderNotification` is the closest
 *   fit — there's no dedicated `shipment` template kind).
 * - `pickup_reminder` → see `mapPickupReminder()` below; always a fan-out
 *   (in-app + staff email), so it isn't handled inside this function.
 * - `welcome`/`review_request` → crm-service's customer register and
 *   review-request flows. Both skip (rather than send to `""`) when the
 *   payload carries no `email` — crm's `customer.email` is nullable
 *   (admin-created/imported customers may have none), same defensive-skip
 *   precedent as `refund`. Neither payload carries a `Store_name`, so that
 *   var renders missing (logged, not fatal) until a producer-side
 *   enrichment adds it — same pre-existing gap `refund`'s vars have.
 * - `purchase_order` → purchasing-service's PO send flow
 *   (`PurchaseOrdersService.send()`). Skips (rather than sending to `""`)
 *   when the payload carries no `email` — same defensive-skip precedent as
 *   `refund`/`welcome`/`review_request`. `subject`/`body` on the payload are
 *   the wizard's recipient-email step's own overrides (already final
 *   merchant-authored text when present), so they're overrides, not
 *   render-var fragments — same `shipment` convention. `Store_name` has the
 *   same pre-existing gap as `welcome`/`review_request`'s vars; unlike
 *   those, `purchasing.supplier.email`/`storeId` aren't what's missing here
 *   — there's simply no store-name lookup anywhere in this repo yet.
 */
export function mapNotifyCommand(payload: Record<string, unknown>): MapNotifyCommandResult {
  const template = payload['template'];

  if (template === 'campaign') {
    const recipient = payload['recipient'];
    const sendId = payload['sendId'];
    const campaignId = payload['campaignId'];
    if (
      typeof recipient !== 'string' || !recipient ||
      typeof sendId !== 'string' || !sendId ||
      typeof campaignId !== 'string' || !campaignId
    ) {
      return { action: 'skip', reason: 'campaign payload missing recipient/sendId/campaignId' };
    }
    return {
      action: 'dispatch',
      input: {
        channel: SendChannel.Email,
        recipient,
        templateKind: TemplateKind.Campaign,
        vars: flattenContentVars(payload['content']),
        refTable: 'campaign_send',
        // Composite, not just sendId — Step 8's webhook forwarding needs
        // *both* ids to call marketing's `POST /campaigns/:id/sends/:sendId/events`
        // (that route validates `send.campaign.id === campaignId`, so the
        // real campaignId is required, not optional). `refId` is a
        // free-form text column precisely so a service-specific composite
        // key like this is fine to store in it.
        refId: `${campaignId}:${sendId}`,
      },
    };
  }

  if (template === 'refund') {
    if (payload['sendToCustomer'] === false) {
      return { action: 'skip', reason: 'sendToCustomer is false' };
    }
    const email = payload['email'];
    const orderId = payload['orderId'];
    const refundId = payload['refundId'];
    if (typeof orderId !== 'string' || !orderId || typeof refundId !== 'string' || !refundId) {
      return { action: 'skip', reason: 'refund payload missing orderId/refundId' };
    }
    if (typeof email !== 'string' || !email) {
      return { action: 'skip', reason: 'refund payload has no customer email' };
    }
    const message = payload['message'];
    return {
      action: 'dispatch',
      input: {
        channel: SendChannel.Email,
        recipient: email,
        templateKind: TemplateKind.Refund,
        vars: { Order_ID: orderId },
        bodyOverride: typeof message === 'string' && message.length > 0 ? message : undefined,
        refTable: 'refund',
        refId: refundId,
      },
    };
  }

  if (template === 'refund_failed_staff_alert') {
    const orderId = payload['orderId'];
    const refundId = payload['refundId'];
    if (typeof orderId !== 'string' || !orderId || typeof refundId !== 'string' || !refundId) {
      return { action: 'skip', reason: 'refund_failed_staff_alert payload missing orderId/refundId' };
    }
    const failureReason = payload['failureReason'];
    return {
      action: 'dispatch',
      input: {
        channel: SendChannel.InApp,
        recipient: 'broadcast',
        templateKind: TemplateKind.Custom,
        vars: {},
        subjectOverride: 'Refund failed',
        bodyOverride: `Refund for order ${orderId} failed${typeof failureReason === 'string' && failureReason ? `: ${failureReason}` : '.'}`,
        refTable: 'refund',
        refId: refundId,
      },
    };
  }

  if (template === 'shipment') {
    const shipmentId = payload['shipmentId'];
    if (typeof shipmentId !== 'string' || !shipmentId) {
      return { action: 'skip', reason: 'shipment payload missing shipmentId' };
    }
    const to = payload['to'];
    const subject = payload['subject'];
    const body = payload['body'];
    const subjectOverride = typeof subject === 'string' && subject.length > 0 ? subject : undefined;
    const bodyOverride = typeof body === 'string' && body.length > 0 ? body : undefined;

    if (typeof to !== 'string' || !to) {
      // No recipient on the composer call — in-app broadcast, same
      // fallback shape as `refund_failed_staff_alert`.
      return {
        action: 'dispatch',
        input: {
          channel: SendChannel.InApp,
          recipient: 'broadcast',
          templateKind: TemplateKind.Custom,
          vars: {},
          subjectOverride: subjectOverride ?? 'Shipment update',
          bodyOverride: bodyOverride ?? `An update is available for shipment ${shipmentId}.`,
          refTable: 'shipment',
          refId: shipmentId,
        },
      };
    }

    const channel = mapShipmentChannel(payload['channel']);
    if (!channel) {
      return {
        action: 'skip',
        reason: `shipment payload has an unrecognized channel "${String(payload['channel'])}"`,
      };
    }

    return {
      action: 'dispatch',
      input: {
        channel,
        recipient: to,
        templateKind: TemplateKind.OrderNotification,
        vars: { Order_ID: shipmentId },
        subjectOverride,
        bodyOverride,
        refTable: 'shipment',
        refId: shipmentId,
      },
    };
  }

  if (template === 'welcome') {
    const email = payload['email'];
    if (typeof email !== 'string' || !email) {
      return { action: 'skip', reason: 'welcome payload has no customer email' };
    }
    const customerName = payload['customerName'];
    const customerId = payload['customerId'];
    return {
      action: 'dispatch',
      input: {
        channel: SendChannel.Email,
        recipient: email,
        templateKind: TemplateKind.Welcome,
        vars: { Customer_name: typeof customerName === 'string' ? customerName : '' },
        refTable: 'customer',
        refId: typeof customerId === 'string' ? customerId : null,
      },
    };
  }

  if (template === 'review_request') {
    const email = payload['email'];
    if (typeof email !== 'string' || !email) {
      return { action: 'skip', reason: 'review_request payload has no customer email' };
    }
    const customerName = payload['customerName'];
    const orderId = payload['orderId'];
    return {
      action: 'dispatch',
      input: {
        channel: SendChannel.Email,
        recipient: email,
        templateKind: TemplateKind.ReviewRequest,
        vars: {
          Customer_name: typeof customerName === 'string' ? customerName : '',
          Order_ID: typeof orderId === 'string' ? orderId : '',
        },
        refTable: 'order',
        refId: typeof orderId === 'string' ? orderId : null,
      },
    };
  }

  if (template === 'purchase_order') {
    const email = payload['email'];
    if (typeof email !== 'string' || !email) {
      return { action: 'skip', reason: 'purchase_order payload has no recipient email' };
    }
    const poId = payload['poId'];
    const supplierName = payload['supplierName'];
    const subject = payload['subject'];
    const body = payload['body'];
    return {
      action: 'dispatch',
      input: {
        channel: SendChannel.Email,
        recipient: email,
        templateKind: TemplateKind.PurchaseOrder,
        vars: {
          Supplier_name: typeof supplierName === 'string' ? supplierName : '',
          PO_ID: typeof poId === 'string' ? poId : '',
        },
        subjectOverride: typeof subject === 'string' && subject.length > 0 ? subject : undefined,
        bodyOverride: typeof body === 'string' && body.length > 0 ? body : undefined,
        refTable: 'purchase_order',
        refId: typeof poId === 'string' ? poId : null,
      },
    };
  }

  return { action: 'skip', reason: `unknown template "${String(template)}"` };
}

/** shipping-service's `NotifChannel` values -> this service's `SendChannel`. `null` on anything unrecognized. */
function mapShipmentChannel(raw: unknown): SendChannel | null {
  if (raw === 'email') return SendChannel.Email;
  if (raw === 'sms') return SendChannel.Sms;
  if (raw === 'inbox_whatsapp') return SendChannel.WhatsApp;
  return null;
}

export interface PickupReminderDispatchItem {
  /** `{eventId}:{action}` — same per-action idempotency shape as `mapStockLowActions`. */
  sourceEventId: string;
  input: MappedDispatchInput;
}

/**
 * Fan-out for `template: 'pickup_reminder'` — in-app broadcast + a direct
 * staff email (the plan's own "in-app broadcast + staff email" spec for
 * this template), mirroring stock-low's `{eventId}:{action}` per-action
 * idempotency. Not folded into `mapNotifyCommand()`'s single-dispatch
 * return shape since this template always fans out to two dispatches, not
 * one — `NotifyCommandsController` special-cases this template before
 * falling into the generic single-mapper path. `staffEmail` is
 * env-configured (`NOTIFICATION_STAFF_EMAIL`) — same gap stock-low's
 * mapper already documents; no per-store staff contact config exists yet.
 */
export function mapPickupReminder(
  eventId: string,
  payload: Record<string, unknown>,
  staffEmail: string,
): PickupReminderDispatchItem[] {
  const pickupId = payload['pickupId'];
  if (typeof pickupId !== 'string' || !pickupId) {
    return [];
  }
  const carrier = payload['carrier'];
  const pickupDate = payload['pickupDate'];
  const body = `Pickup reminder: ${typeof carrier === 'string' && carrier ? carrier : 'carrier'} pickup scheduled for ${typeof pickupDate === 'string' && pickupDate ? pickupDate : 'today'} (pickup ${pickupId}).`;

  return [
    {
      sourceEventId: `${eventId}:send_inbox`,
      input: {
        channel: SendChannel.InApp,
        recipient: 'broadcast',
        templateKind: TemplateKind.Custom,
        vars: {},
        subjectOverride: 'Pickup reminder',
        bodyOverride: body,
        refTable: 'pickup',
        refId: pickupId,
      },
    },
    {
      sourceEventId: `${eventId}:send_email`,
      input: {
        channel: SendChannel.Email,
        recipient: staffEmail,
        templateKind: TemplateKind.Custom,
        vars: {},
        subjectOverride: 'Pickup reminder',
        bodyOverride: body,
        refTable: 'pickup',
        refId: pickupId,
      },
    },
  ];
}

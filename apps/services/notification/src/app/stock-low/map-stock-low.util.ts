import { SendChannel } from '../entities/send-log.entity';
import { TemplateKind } from '../entities/email-template.entity';
import { MappedDispatchInput } from '../notify-commands/map-notify-command.util';
import { StockAlertAction, StockLowPayload } from './stock-low-event-payload';

export interface StockLowDispatchItem {
  /** `{eventId}:{action}` — one sourceEventId per (event, action) pair, so redelivery stays idempotent per action rather than per whole event. */
  sourceEventId: string;
  input: MappedDispatchInput;
}

function describeStockLow(payload: StockLowPayload): string {
  return `Stock for variant ${payload.variantId} is low: ${payload.available} available (on hand ${payload.onHand}, reserved ${payload.reserved}).`;
}

/**
 * Pure fan-out — one dispatch item per actionable entry in the alert's
 * `actions[]`, `create_task` and any unrecognized action ack-and-ignored
 * (no task/automation service exists to hand a task to). `staffEmail`/
 * `staffPhone` are env-configured for now (`NOTIFICATION_STAFF_EMAIL`/
 * `NOTIFICATION_STAFF_PHONE`) — per-store staff contact config doesn't
 * exist yet, same gap the plan already calls out for email.
 */
export function mapStockLowActions(
  eventId: string,
  payload: StockLowPayload,
  staffEmail: string,
  staffPhone: string,
): StockLowDispatchItem[] {
  const items: StockLowDispatchItem[] = [];
  const body = describeStockLow(payload);

  for (const action of payload.actions) {
    switch (action as StockAlertAction) {
      case 'send_email':
        items.push({
          sourceEventId: `${eventId}:${action}`,
          input: {
            channel: SendChannel.Email,
            recipient: staffEmail,
            templateKind: TemplateKind.Custom,
            vars: {},
            subjectOverride: 'Low stock',
            bodyOverride: body,
            refTable: 'stock_alert',
            refId: payload.alertId,
          },
        });
        break;
      case 'send_inbox':
        items.push({
          sourceEventId: `${eventId}:${action}`,
          input: {
            channel: SendChannel.InApp,
            recipient: 'broadcast',
            templateKind: TemplateKind.Custom,
            vars: {},
            subjectOverride: 'Low stock',
            bodyOverride: body,
            refTable: 'stock_alert',
            refId: payload.alertId,
          },
        });
        break;
      case 'send_sms':
        items.push({
          sourceEventId: `${eventId}:${action}`,
          input: {
            channel: SendChannel.Sms,
            recipient: staffPhone,
            templateKind: TemplateKind.Custom,
            vars: {},
            bodyOverride: body,
            refTable: 'stock_alert',
            refId: payload.alertId,
          },
        });
        break;
      case 'create_task':
        // Ack-and-ignore — no task/automation service exists to hand this to.
        break;
      default:
        // Forward compatibility: an alert action this service doesn't
        // recognize yet is ignored, not an error.
        break;
    }
  }

  return items;
}

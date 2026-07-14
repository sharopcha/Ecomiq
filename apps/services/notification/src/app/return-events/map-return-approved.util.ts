import { SendChannel } from '../entities/send-log.entity';
import { TemplateKind } from '../entities/email-template.entity';
import { MappedDispatchInput } from '../notify-commands/map-notify-command.util';
import { ReturnApprovedPayload } from './return-approved-event-payload';

export type MapReturnApprovedResult =
  | { action: 'dispatch'; input: MappedDispatchInput }
  | { action: 'skip'; reason: string };

/**
 * Pure mapper — `orders.return.approved` → a customer RMA-approval email.
 * Skips (rather than dispatching to a blank recipient) if the payload
 * carries no customer email; order-service's `contactEmail` enrichment
 * (added alongside this mapper) should always populate it, but a defensive
 * skip beats sending to `""`.
 */
export function mapReturnApproved(payload: ReturnApprovedPayload): MapReturnApprovedResult {
  if (!payload.email) {
    return { action: 'skip', reason: 'return-approved payload has no customer email' };
  }
  return {
    action: 'dispatch',
    input: {
      channel: SendChannel.Email,
      recipient: payload.email,
      templateKind: TemplateKind.ReturnApproval,
      vars: { Order_ID: payload.orderId, RMA_ID: payload.displayId },
      refTable: 'return_request',
      refId: payload.returnId,
    },
  };
}

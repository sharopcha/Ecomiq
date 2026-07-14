import { mapReturnApproved } from './map-return-approved.util';
import { SendChannel } from '../entities/send-log.entity';
import { TemplateKind } from '../entities/email-template.entity';
import { ReturnApprovedPayload } from './return-approved-event-payload';

const basePayload: ReturnApprovedPayload = {
  returnId: 'return_1',
  storeId: 'store_1',
  orderId: 'order_1',
  displayId: 'RMA-1042',
  status: 'approved',
  shippingStatus: 'pending',
  inspected: false,
  email: 'ada@example.com',
};

describe('mapReturnApproved', () => {
  it('maps to a customer RMA-approval email', () => {
    const result = mapReturnApproved(basePayload);
    expect(result.action).toBe('dispatch');
    if (result.action !== 'dispatch') return;
    expect(result.input.channel).toBe(SendChannel.Email);
    expect(result.input.recipient).toBe('ada@example.com');
    expect(result.input.templateKind).toBe(TemplateKind.ReturnApproval);
    expect(result.input.vars).toEqual({ Order_ID: 'order_1', RMA_ID: 'RMA-1042' });
    expect(result.input.refTable).toBe('return_request');
    expect(result.input.refId).toBe('return_1');
  });

  it('skips when the payload carries no customer email', () => {
    const result = mapReturnApproved({ ...basePayload, email: null });
    expect(result.action).toBe('skip');
    if (result.action !== 'skip') return;
    expect(result.reason).toMatch(/email/);
  });

  it('skips on an empty-string email too', () => {
    const result = mapReturnApproved({ ...basePayload, email: '' });
    expect(result.action).toBe('skip');
  });
});

import { mapNotifyCommand, mapPickupReminder } from './map-notify-command.util';
import { SendChannel } from '../entities/send-log.entity';
import { TemplateKind } from '../entities/email-template.entity';

describe('mapNotifyCommand', () => {
  describe('campaign', () => {
    it('maps to an email dispatch with content flattened into vars', () => {
      const result = mapNotifyCommand({
        template: 'campaign',
        campaignId: 'camp_1',
        sendId: 'send_1',
        recipient: 'ada@example.com',
        content: { subject: 'Hello', discountPct: 20, featured: true, nested: { a: 1 } },
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.channel).toBe(SendChannel.Email);
      expect(result.input.recipient).toBe('ada@example.com');
      expect(result.input.templateKind).toBe(TemplateKind.Campaign);
      expect(result.input.vars).toEqual({ subject: 'Hello', discountPct: '20', featured: 'true' });
      expect(result.input.refTable).toBe('campaign_send');
      expect(result.input.refId).toBe('camp_1:send_1');
    });

    it('skips when recipient, sendId, or campaignId is missing', () => {
      const result = mapNotifyCommand({ template: 'campaign', campaignId: 'camp_1' });
      expect(result.action).toBe('skip');
    });

    it('handles a null/missing content object without throwing', () => {
      const result = mapNotifyCommand({
        template: 'campaign',
        campaignId: 'camp_1',
        sendId: 'send_1',
        recipient: 'ada@example.com',
        content: null,
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.vars).toEqual({});
    });
  });

  describe('refund', () => {
    it('maps to a customer email with the message as a body override', () => {
      const result = mapNotifyCommand({
        template: 'refund',
        orderId: 'order_1',
        refundId: 'refund_1',
        amountMinor: 1500,
        sendToCustomer: true,
        message: 'Sorry for the trouble!',
        email: 'ada@example.com',
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.channel).toBe(SendChannel.Email);
      expect(result.input.recipient).toBe('ada@example.com');
      expect(result.input.templateKind).toBe(TemplateKind.Refund);
      expect(result.input.vars).toEqual({ Order_ID: 'order_1' });
      expect(result.input.bodyOverride).toBe('Sorry for the trouble!');
      expect(result.input.refTable).toBe('refund');
      expect(result.input.refId).toBe('refund_1');
    });

    it('has no body override when message is null', () => {
      const result = mapNotifyCommand({
        template: 'refund',
        orderId: 'order_1',
        refundId: 'refund_1',
        sendToCustomer: true,
        message: null,
        email: 'ada@example.com',
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.bodyOverride).toBeUndefined();
    });

    it('skips outright when sendToCustomer is false', () => {
      const result = mapNotifyCommand({
        template: 'refund',
        orderId: 'order_1',
        refundId: 'refund_1',
        sendToCustomer: false,
        email: 'ada@example.com',
      });
      expect(result.action).toBe('skip');
      if (result.action !== 'skip') return;
      expect(result.reason).toMatch(/sendToCustomer/);
    });

    it('skips when the payload carries no customer email', () => {
      const result = mapNotifyCommand({
        template: 'refund',
        orderId: 'order_1',
        refundId: 'refund_1',
        sendToCustomer: true,
        email: null,
      });
      expect(result.action).toBe('skip');
      if (result.action !== 'skip') return;
      expect(result.reason).toMatch(/email/);
    });
  });

  describe('refund_failed_staff_alert', () => {
    it('maps to an in-app broadcast with fully synthesized content', () => {
      const result = mapNotifyCommand({
        template: 'refund_failed_staff_alert',
        orderId: 'order_1',
        refundId: 'refund_1',
        failureReason: 'card declined',
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.channel).toBe(SendChannel.InApp);
      expect(result.input.recipient).toBe('broadcast');
      expect(result.input.subjectOverride).toBe('Refund failed');
      expect(result.input.bodyOverride).toContain('order_1');
      expect(result.input.bodyOverride).toContain('card declined');
      expect(result.input.refTable).toBe('refund');
      expect(result.input.refId).toBe('refund_1');
    });

    it('still produces a body without a failureReason', () => {
      const result = mapNotifyCommand({
        template: 'refund_failed_staff_alert',
        orderId: 'order_1',
        refundId: 'refund_1',
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.bodyOverride).toBe('Refund for order order_1 failed.');
    });
  });

  describe('shipment', () => {
    it('maps to a channel-respecting dispatch when a recipient is given', () => {
      const result = mapNotifyCommand({
        template: 'shipment',
        shipmentId: 'shipment_1',
        channel: 'sms',
        to: '+15551234567',
        body: 'Your order shipped!',
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.channel).toBe(SendChannel.Sms);
      expect(result.input.recipient).toBe('+15551234567');
      expect(result.input.templateKind).toBe(TemplateKind.OrderNotification);
      expect(result.input.bodyOverride).toBe('Your order shipped!');
      expect(result.input.refTable).toBe('shipment');
      expect(result.input.refId).toBe('shipment_1');
    });

    it('maps email/inbox_whatsapp channels correctly', () => {
      const email = mapNotifyCommand({ template: 'shipment', shipmentId: 's1', channel: 'email', to: 'ada@example.com' });
      expect(email.action === 'dispatch' && email.input.channel).toBe(SendChannel.Email);

      const whatsapp = mapNotifyCommand({ template: 'shipment', shipmentId: 's1', channel: 'inbox_whatsapp', to: '+1555' });
      expect(whatsapp.action === 'dispatch' && whatsapp.input.channel).toBe(SendChannel.WhatsApp);
    });

    it('falls back to an in-app broadcast when there is no recipient', () => {
      const result = mapNotifyCommand({ template: 'shipment', shipmentId: 'shipment_1' });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.channel).toBe(SendChannel.InApp);
      expect(result.input.recipient).toBe('broadcast');
      expect(result.input.bodyOverride).toContain('shipment_1');
    });

    it('skips an unrecognized channel value', () => {
      const result = mapNotifyCommand({ template: 'shipment', shipmentId: 's1', channel: 'carrier_pigeon', to: 'ada@example.com' });
      expect(result.action).toBe('skip');
      if (result.action !== 'skip') return;
      expect(result.reason).toMatch(/channel/);
    });

    it('skips when shipmentId is missing', () => {
      const result = mapNotifyCommand({ template: 'shipment' });
      expect(result.action).toBe('skip');
    });
  });

  describe('purchase_order', () => {
    it('maps to a supplier email with Supplier_name/PO_ID vars and subject/body overrides', () => {
      const result = mapNotifyCommand({
        template: 'purchase_order',
        poId: 'po_1',
        supplierId: 'supplier_1',
        supplierName: 'Acme Textiles',
        email: 'orders@acme-textiles.example',
        subject: 'Custom subject',
        body: 'Custom body',
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.channel).toBe(SendChannel.Email);
      expect(result.input.recipient).toBe('orders@acme-textiles.example');
      expect(result.input.templateKind).toBe(TemplateKind.PurchaseOrder);
      expect(result.input.vars).toEqual({ Supplier_name: 'Acme Textiles', PO_ID: 'po_1' });
      expect(result.input.subjectOverride).toBe('Custom subject');
      expect(result.input.bodyOverride).toBe('Custom body');
      expect(result.input.refTable).toBe('purchase_order');
      expect(result.input.refId).toBe('po_1');
    });

    it('has no overrides when subject/body are absent — falls back to the default template', () => {
      const result = mapNotifyCommand({
        template: 'purchase_order',
        poId: 'po_1',
        supplierName: 'Acme Textiles',
        email: 'orders@acme-textiles.example',
      });
      expect(result.action).toBe('dispatch');
      if (result.action !== 'dispatch') return;
      expect(result.input.subjectOverride).toBeUndefined();
      expect(result.input.bodyOverride).toBeUndefined();
    });

    it('skips when the payload carries no recipient email', () => {
      const result = mapNotifyCommand({
        template: 'purchase_order',
        poId: 'po_1',
        supplierName: 'Acme Textiles',
        email: null,
      });
      expect(result.action).toBe('skip');
      if (result.action !== 'skip') return;
      expect(result.reason).toMatch(/email/);
    });
  });

  describe('unknown template', () => {
    it('skips without throwing — forward compatibility for payloads this service does not know yet', () => {
      const result = mapNotifyCommand({ template: 'purchase_order_created', poId: 'po_1' });
      expect(result.action).toBe('skip');
      if (result.action !== 'skip') return;
      expect(result.reason).toMatch(/unknown template/);
    });

    it('skips a payload with no template field at all', () => {
      const result = mapNotifyCommand({});
      expect(result.action).toBe('skip');
    });
  });
});

describe('mapPickupReminder', () => {
  it('fans out to an in-app broadcast + a staff email, both distinctly source-tagged', () => {
    const items = mapPickupReminder(
      'evt_1',
      { pickupId: 'pickup_1', carrier: 'usps', pickupDate: '2026-08-01' },
      'staff@example.com',
    );
    expect(items).toHaveLength(2);

    const inApp = items.find((i) => i.input.channel === SendChannel.InApp);
    expect(inApp?.sourceEventId).toBe('evt_1:send_inbox');
    expect(inApp?.input.recipient).toBe('broadcast');
    expect(inApp?.input.bodyOverride).toContain('usps');
    expect(inApp?.input.bodyOverride).toContain('2026-08-01');

    const email = items.find((i) => i.input.channel === SendChannel.Email);
    expect(email?.sourceEventId).toBe('evt_1:send_email');
    expect(email?.input.recipient).toBe('staff@example.com');
  });

  it('returns no items when pickupId is missing', () => {
    const items = mapPickupReminder('evt_1', { carrier: 'usps' }, 'staff@example.com');
    expect(items).toHaveLength(0);
  });
});

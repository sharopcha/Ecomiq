import { TemplateKind } from '../entities/email-template.entity';

export interface DefaultTemplate {
  subject: string;
  body: string;
}

/**
 * Built-in fallback per `TemplateKind` — `resolveTemplate()` (templates.service.ts)
 * falls back to these when a store has no `email_template` row of the
 * requested kind, so Steps 6-10's event-driven sends never fail against a
 * fresh store that hasn't configured its own templates yet.
 */
export const DEFAULT_TEMPLATES: Record<TemplateKind, DefaultTemplate> = {
  [TemplateKind.OrderNotification]: {
    subject: 'An update on your order {{Order_ID}}',
    body: 'Hi {{Customer_name}},\n\nThere is an update on your order {{Order_ID}} from {{Store_name}}.',
  },
  [TemplateKind.ShipmentDelay]: {
    subject: 'Your order {{Order_ID}} has been delayed',
    body: 'Hi {{Customer_name}},\n\nYour order {{Order_ID}} from {{Store_name}} has been delayed. We apologize for the inconvenience.',
  },
  [TemplateKind.ReturnApproval]: {
    subject: 'Your return for order {{Order_ID}} was approved',
    body: 'Hi {{Customer_name}},\n\nYour return request (RMA #{{RMA_ID}}) for order {{Order_ID}} has been approved by {{Store_name}}.',
  },
  [TemplateKind.Refund]: {
    subject: 'A refund was issued for order {{Order_ID}}',
    body: 'Hi {{Customer_name}},\n\nA refund has been issued for your order {{Order_ID}} from {{Store_name}}.',
  },
  [TemplateKind.PurchaseOrder]: {
    subject: 'New purchase order from {{Store_name}}',
    body: 'Hi {{Supplier_name}},\n\n{{Store_name}} has issued a new purchase order.',
  },
  [TemplateKind.Campaign]: {
    subject: '{{Store_name}} has something for you',
    body: 'Hi {{Customer_name}},\n\n{{Store_name}} thought you would like to know.',
  },
  [TemplateKind.Custom]: {
    subject: 'A message from {{Store_name}}',
    body: 'Hi {{Customer_name}},\n\nThis is a message from {{Store_name}}.',
  },
  [TemplateKind.Welcome]: {
    subject: 'Welcome to {{Store_name}}!',
    body: 'Hi {{Customer_name}},\n\nWelcome to {{Store_name}} — we are glad you are here.',
  },
  [TemplateKind.ReviewRequest]: {
    subject: 'How was your order {{Order_ID}}?',
    body: 'Hi {{Customer_name}},\n\nWe would love to hear what you think about your recent order {{Order_ID}} from {{Store_name}}. Please leave a review when you have a moment.',
  },
};

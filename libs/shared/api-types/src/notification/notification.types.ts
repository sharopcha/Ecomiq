export interface NotificationDto {
  id: string;
  userId: string | null;
  kind: string;
  title: string | null;
  body: string | null;
  refTable: string | null;
  refId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** `GET /notifications` — offset-style `{items, total}`, not cursor-paginated like templates. */
export interface NotificationFeedResponse {
  items: NotificationDto[];
  total: number;
}

export type TemplateKind =
  | 'order_notification'
  | 'shipment_delay'
  | 'return_approval'
  | 'refund'
  | 'purchase_order'
  | 'campaign'
  | 'custom'
  | 'welcome'
  | 'review_request';

/**
 * `GET /notifications/templates` — same resource referenced from both the
 * notifications feature and shipping's "notify customer" modal (was two
 * differently-shaped admin-side types, `EmailTemplate` vs
 * `NotificationTemplate`; this is the one shared shape). `subject`/`body`
 * carry `{{Customer_name}}`-style variables interpolated at send time —
 * there is no separate `variables` field on the wire.
 */
export interface EmailTemplateDto {
  id: string;
  kind: TemplateKind;
  name: string;
  subject: string | null;
  body: string | null;
  isAiRecommended: boolean;
  createdBy: string | null;
  createdAt: string;
}

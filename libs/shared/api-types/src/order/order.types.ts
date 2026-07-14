// ── Storefront: POST /storefront/compose (order-service) ────────────────────

export interface ComposeOrderLineRequestDto {
  variantId: string;
  qty: number;
  expectedPriceMinor: number;
}

export interface ComposeOrderRequestDto {
  lines: ComposeOrderLineRequestDto[];
  shippingAddress: Record<string, unknown>;
  contactEmail?: string;
  contactPhone?: string;
}

export interface ComposeOrderResponseDto {
  orders: {
    id: string;
    displayNumber: number;
    storeId: string;
    status: string;
    totalMinor: number;
    currency: string;
  }[];
  failedGroups: {
    storeId: string;
    reason: string;
    problems: string[];
  }[];
}

// ── Storefront: GET /storefront/my-orders, /:id, /:id/status (order-service) ─

export interface MyOrderSummaryDto {
  id: string;
  displayNumber: number;
  storeId: string;
  status: 'draft' | 'open' | 'completed' | 'canceled';
  fulfillmentStatus: 'unfulfilled' | 'partially_fulfilled' | 'fulfilled' | 'canceled';
  paymentStatus: 'pending' | 'paid' | 'partially_refunded' | 'refunded' | 'failed' | 'canceled';
  /** `'delivered'` is the "write a review" gate — see `ReviewForm`'s call site. */
  stage: 'review_order' | 'preparing_order' | 'shipping' | 'delivered';
  totalMinor: number;
  currency: string;
  createdAt: string;
}

export interface MyOrderLineDto {
  id: string;
  variantId: string;
  /** Null for lines placed before this field existed — see `OrderLine.productId`. Gates whether a review can target this line. */
  productId: string | null;
  name: string;
  sku?: string | null;
  variantLabel?: string | null;
  qty: number;
  fulfilledQty: number;
  unitPriceMinor: number;
  imageFileId?: string | null;
}

export interface MyOrderDetailDto extends MyOrderSummaryDto {
  subtotalMinor: number;
  shippingFeeMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingAddress: Record<string, unknown> | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentId: string | null;
  /** Feeds `GET /api/shipping/track/:storeId/:shipmentDisplayId` (public) — null until the shipment leaves `draft`. */
  shipmentDisplayId: string | null;
  lines: MyOrderLineDto[];
}

export interface MyOrdersResponse {
  orders: MyOrderSummaryDto[];
}

/** Mirrors the staff `checkout-status` shape (`CheckoutController`), customer-scoped. */
export interface MyOrderStatusDto {
  sagaStatus: 'running' | 'compensating' | 'completed' | 'failed' | null;
  orderStatus: MyOrderSummaryDto['status'];
  paymentState: MyOrderSummaryDto['paymentStatus'];
  redirectUrl: string | null;
}

// ── Admin: /api/orders (order-service, cursor-paginated via shared `paginate()`) ──

export interface AdminOrderLineDto {
  id: string;
  variantId: string;
  name: string;
  sku?: string | null;
  variantLabel?: string | null;
  qty: number;
  fulfilledQty: number;
  unitPriceMinor: number;
  imageFileId?: string | null;
  reservationId?: string | null;
}

export interface AdminOrderTagDto {
  id: string;
  name: string;
}

export interface AdminOrderDto {
  id: string;
  storeId: string;
  displayNumber: number;
  customerId?: string | null;
  channelId?: string | null;
  channelType: 'online_store' | 'pos' | 'manual' | 'marketplace' | 'mobile_app';
  status: 'draft' | 'open' | 'completed' | 'canceled';
  paymentStatus: 'pending' | 'paid' | 'partially_refunded' | 'refunded' | 'failed' | 'canceled';
  fulfillmentStatus: 'unfulfilled' | 'partially_fulfilled' | 'fulfilled' | 'canceled';
  stage: 'review_order' | 'preparing_order' | 'shipping' | 'delivered';
  orderDate: string;
  estimatedArrivalStart?: string | null;
  estimatedArrivalEnd?: string | null;
  subtotalMinor: number;
  shippingType?: string | null;
  shippingFeeMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  note?: string | null;
  shippingAddress?: Record<string, unknown> | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  canceledAt?: string | null;
  cancelReason?: string | null;
  discountId?: string | null;
  discountCode?: string | null;
  paymentId?: string | null;
  lines?: AdminOrderLineDto[];
  tags?: AdminOrderTagDto[];
}

/**
 * `comment` — a single polymorphic table addressed by `(subjectTable,
 * subjectId)`, shared by order comments (`subjectTable: 'order'`) AND
 * return-request comments (`subjectTable: 'return_request'`) — there is no
 * separate return-comment shape, both `OrderCommentsController` and
 * `ReturnCommentsController` read/write the same `OrderCommentsService`.
 * The field is `body`, not `content`; there is no `authorName` — `authorId`
 * is an opaque identity-service user id with no cross-service name
 * resolution here.
 */
export interface AdminOrderCommentDto {
  id: string;
  storeId: string;
  subjectTable: string;
  subjectId: string;
  authorId: string | null;
  body: string;
  attachmentFileIds?: string[] | null;
  visibility: 'staff_only' | 'public';
  createdAt: string;
}

export interface CreateOrderCommentRequestDto {
  body: string;
  visibility?: 'staff_only' | 'public';
  attachmentFileIds?: string[];
}

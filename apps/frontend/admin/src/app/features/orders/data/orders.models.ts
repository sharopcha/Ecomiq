export type OrderStatus = 'draft' | 'open' | 'completed' | 'canceled';
export type OrderPaymentStatus = 'pending' | 'paid' | 'partially_refunded' | 'refunded' | 'failed' | 'canceled';
export type FulfillmentStatus = 'unfulfilled' | 'partially_fulfilled' | 'fulfilled' | 'canceled';
export type OrderStage = 'review_order' | 'preparing_order' | 'shipping' | 'delivered';
export type OrderChannelType = 'online_store' | 'pos' | 'manual' | 'marketplace' | 'mobile_app';

export interface OrderLine {
  id: string;
  variant_id: string;
  name: string;
  sku?: string;
  variant_label?: string;
  qty: number;
  fulfilled_qty: number;
  unit_price_minor: number;
  image_file_id?: string;
  reservation_id?: string;
}

export interface OrderTag {
  id: string;
  name: string;
}

export interface OrderComment {
  id: string;
  store_id: string;
  subject_table: string;
  subject_id: string;
  content: string;
  author_id: string;
  created_at: string;
}

export interface Order {
  id: string;
  store_id: string;
  display_number: number;
  customer_id?: string;
  channel_id?: string;
  channel_type: OrderChannelType;
  status: OrderStatus;
  payment_status: OrderPaymentStatus;
  fulfillment_status: FulfillmentStatus;
  stage: OrderStage;
  order_date: string;
  estimated_arrival_start?: string;
  estimated_arrival_end?: string;
  subtotal_minor: number;
  shipping_type?: string;
  shipping_fee_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  note?: string;
  shipping_address?: Record<string, unknown>;
  contact_email?: string;
  contact_phone?: string;
  canceled_at?: string;
  cancel_reason?: string;
  discount_id?: string;
  discount_code?: string;
  payment_id?: string;
  lines: OrderLine[];
  tags: OrderTag[];
}

export type ReturnStatus = 'pending_approval' | 'approved' | 'rejected' | 'expired' | 'resolved';
export type ReturnShipping = 'none' | 'sending' | 'delivered' | 'received';
export type RefundType = 'full' | 'partial' | 'none';
export type RefundStatus = 'requested' | 'processing' | 'refunded' | 'declined' | 'not_refunded';

export interface PaginatedList<T> {
  items: T[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface ReturnProof {
  id: string;
  url: string;
  thumbnail_url?: string;
  type: 'image' | 'video';
}

export interface ReturnLine {
  order_line_id: string;
  qty: number;
}

export interface ReturnRequest {
  id: string;
  display_id: string;
  order_id: string;
  customer_id?: string;
  status: ReturnStatus;
  shipping_status: ReturnShipping;
  reason?: string;
  requested_at: string;
  approved_at?: string;
  rejected_at?: string;
  resolved_at?: string;
  expires_at?: string;
  inspected: boolean;
  note?: string;
  lines?: ReturnLine[];
  proofs?: ReturnProof[];
}

export interface Refund {
  id: string;
  return_id?: string;
  order_id: string;
  payment_id?: string;
  refund_type: RefundType;
  amount_minor: number;
  reason?: string;
  message_to_customer?: string;
  send_info_to_customer: boolean;
  status: RefundStatus;
  created_at: string;
  refunded_at?: string;
  failure_reason?: string;
}

export interface CreateReturnRequestDto {
  orderId: string;
  lines: { orderLineId: string; qty: number }[];
  reason?: string;
}

export interface OrderComment {
  id: string;
  store_id: string;
  subject_table: string;
  subject_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface FileItem {
  id: string;
  name: string;
  owner: string;
  last_modified: string;
  size: string;
  url: string;
  type: 'image' | 'video' | 'document';
}

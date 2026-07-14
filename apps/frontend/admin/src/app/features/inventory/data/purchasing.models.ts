export type PurchaseOrderStatus = 'draft' | 'pending' | 'approved' | 'shipped' | 'received' | 'cancelled';

export interface PurchaseOrderLineItem {
  id: string;
  product_id: string;
  variant_id?: string;
  sku: string;
  name: string;
  unit_cost_minor: number;
  qty: number;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  supplier_name: string;
  status: PurchaseOrderStatus;
  created_at: string;
  expected_delivery?: string;
  total_amount_minor: number;
  items: PurchaseOrderLineItem[];
  payment_terms?: string;
  carrier?: string;
  notes?: string;
}

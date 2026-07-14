export type ShipmentStatus = 'draft' | 'in_progress' | 'arrived' | 'canceled';
export type ShipmentEventKind = 'order_placed' | 'preparing_to_ship' | 'confirm_shipment' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
export type PickupStatus = 'scheduled' | 'completed' | 'canceled';

export interface PaginatedList<T> {
  items: T[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface ShipmentEvent {
  id: string;
  kind: ShipmentEventKind;
  description?: string;
  location?: string;
  occurred_at: string;
  carrier_event_id?: string;
}

export interface Shipment {
  id: string;
  display_id: string;
  order_id: string;
  fulfillment_id?: string;
  status: ShipmentStatus;
  is_delayed: boolean;
  delay_reason?: string;
  carrier?: string;
  service_type?: string;
  ship_date?: string;
  origin_address?: any;
  destination_address?: any;
  departure_at?: string;
  expected_arrival_at?: string;
  total_time_interval?: string;
  current_stage: number;
  contact_email?: string;
  events?: ShipmentEvent[];
  created_at?: string;
}

export interface TrackingNumber {
  id: string;
  value: string;
}

export interface FulfillmentLine {
  fulfillment_id: string;
  order_line_id: string;
  qty: number;
  weight_lb?: number;
}

export interface Fulfillment {
  id: string;
  order_id: string;
  notify_customer: boolean;
  lines?: FulfillmentLine[];
  tracking_numbers?: TrackingNumber[];
}

export interface PackagePreset {
  id: string;
  name: string;
  package_type?: string;
  weight_kg?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
}

export interface ShippingLabelPackage {
  id: string;
  order_line_id?: string;
  package_preset_id?: string;
  package_name?: string;
  package_type?: string;
  item_weight_kg?: number;
  total_weight_kg?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  combined: boolean;
}

export interface ShippingLabel {
  id: string;
  order_id: string;
  carrier: string;
  service_type?: string;
  insurance?: string;
  ship_date?: string;
  notify_customer: boolean;
  return_address?: any;
  destination_address?: any;
  subtotal_minor?: number;
  discount_minor?: number;
  total_minor?: number;
  label_file_id?: string;
  purchased_at?: string;
  packages?: ShippingLabelPackage[];
}

export interface Pickup {
  id: string;
  shipment_id: string;
  carrier: string;
  pickup_date: string;
  pickup_time?: string;
  meridiem?: string;
  note?: string;
  status: PickupStatus;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

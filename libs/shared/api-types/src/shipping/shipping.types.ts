export type ShipmentStatus = 'draft' | 'in_progress' | 'arrived' | 'canceled';
export type ShipmentEventKind =
  | 'order_placed'
  | 'preparing_to_ship'
  | 'confirm_shipment'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception';
export type PickupStatus = 'scheduled' | 'completed' | 'canceled';

export interface ShipmentEventDto {
  id: string;
  kind: ShipmentEventKind;
  description?: string;
  location?: string;
  occurredAt: string;
  carrierEventId?: string;
}

export interface ShipmentDto {
  id: string;
  displayId: string;
  orderId: string;
  fulfillmentId?: string | null;
  status: ShipmentStatus;
  isDelayed: boolean;
  delayReason?: string | null;
  carrier?: string;
  serviceType?: string | null;
  shipDate?: string | null;
  originAddress?: Record<string, unknown> | null;
  destinationAddress?: Record<string, unknown> | null;
  departureAt?: string | null;
  expectedArrivalAt?: string | null;
  totalTimeInterval?: string | null;
  currentStage: number;
  contactEmail?: string | null;
  events?: ShipmentEventDto[];
  createdAt?: string;
}

export interface TrackingNumberDto {
  id: string;
  value: string;
}

export interface FulfillmentLineDto {
  fulfillmentId: string;
  orderLineId: string;
  qty: number;
  weightLb?: number;
}

export interface FulfillmentDto {
  id: string;
  orderId: string;
  notifyCustomer: boolean;
  lines?: FulfillmentLineDto[];
  trackingNumbers?: TrackingNumberDto[];
}

export interface PackagePresetDto {
  id: string;
  name: string;
  packageType?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface ShippingLabelPackageDto {
  id: string;
  orderLineId?: string;
  packagePresetId?: string;
  packageName?: string;
  packageType?: string;
  itemWeightKg?: number;
  totalWeightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  combined: boolean;
}

export interface ShippingLabelDto {
  id: string;
  orderId: string;
  carrier: string;
  serviceType?: string;
  insurance?: string;
  shipDate?: string;
  notifyCustomer: boolean;
  returnAddress?: Record<string, unknown> | null;
  destinationAddress?: Record<string, unknown> | null;
  subtotalMinor?: number;
  discountMinor?: number;
  totalMinor?: number;
  labelFileId?: string;
  purchasedAt?: string;
  packages?: ShippingLabelPackageDto[];
}

export interface PickupDto {
  id: string;
  shipmentId: string;
  carrier: string;
  pickupDate: string;
  pickupTime?: string;
  meridiem?: string;
  note?: string;
  status: PickupStatus;
}

export interface PublicTrackingEventDto {
  kind: ShipmentEventKind;
  description: string | null;
  location: string | null;
  occurredAt: string;
}

/**
 * `GET /track/:storeSlugOrId/:displayIdOrTracking` (shipping-service,
 * `@Public()`) — strips everything PII (`contactEmail`, `orderId`,
 * `fulfillmentId`, full addresses, `carrierEventId`) down to
 * `destinationCity` and the bare event timeline. A stranger with a
 * shipment's display id or tracking number should learn "where it is,"
 * never "who it's going to."
 */
export interface PublicTrackingResponseDto {
  displayId: string;
  status: ShipmentStatus;
  currentStage: number;
  isDelayed: boolean;
  delayReason: string | null;
  carrier: string | null;
  serviceType: string | null;
  expectedArrivalAt: string | null;
  destinationCity: string | null;
  events: PublicTrackingEventDto[];
}

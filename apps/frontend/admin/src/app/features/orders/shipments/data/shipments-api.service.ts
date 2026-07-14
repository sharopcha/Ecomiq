import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ShipmentsMockService } from './shipments.mock-service';
import {
  Shipment,
  Fulfillment,
  ShippingLabel,
  PackagePreset,
  Pickup,
  NotificationTemplate,
  PaginatedList
} from './shipments.models';
import type {
  ShipmentDto,
  FulfillmentDto,
  ShippingLabelDto,
  PackagePresetDto,
  PickupDto,
} from '@temp-nx/api-types/shipping';
import type { EmailTemplateDto } from '@temp-nx/api-types/notification';

@Injectable({ providedIn: 'root' })
export class ShipmentsApiService {
  private readonly http = inject(HttpClient);
  private readonly mock = inject(ShipmentsMockService);

  // === SHIPMENTS ===

  getShipments(params?: any): Observable<PaginatedList<Shipment>> {
    return this.http.get<any>('/api/shipping/shipments', { params }).pipe(
      map(res => ({
        ...res,
        items: res.items.map(this.toAdminShipment)
      }))
    );
  }

  getShipmentById(id: string): Observable<Shipment> {
    return this.http.get<ShipmentDto>(`/api/shipping/shipments/${id}`).pipe(
      map(this.toAdminShipment)
    );
  }

  createShipment(payload: any): Observable<Shipment> {
    return this.http.post<ShipmentDto>('/api/shipping/shipments', this.toApiPayload(payload)).pipe(
      map(this.toAdminShipment)
    );
  }

  cancelShipment(id: string): Observable<Shipment> {
    return this.http.post<ShipmentDto>(`/api/shipping/shipments/${id}/cancel`, {}).pipe(
      map(this.toAdminShipment)
    );
  }

  transitionShipment(id: string, status: string): Observable<Shipment> {
    return this.http.post<ShipmentDto>(`/api/shipping/shipments/${id}/transition`, { status }).pipe(
      map(this.toAdminShipment)
    );
  }

  addEvent(id: string, payload: any): Observable<any> {
    return this.http.post(`/api/shipping/shipments/${id}/events`, this.toApiPayload(payload));
  }

  delayShipment(id: string, reason: string): Observable<Shipment> {
    return this.http.post<ShipmentDto>(`/api/shipping/shipments/${id}/delay`, { reason }).pipe(
      map(this.toAdminShipment)
    );
  }

  // === FULFILLMENTS ===

  fulfillItem(payload: any): Observable<Fulfillment> {
    return this.http.post<FulfillmentDto>('/api/shipping/fulfillments', this.toApiPayload(payload)).pipe(
      map(this.toAdminFulfillment)
    );
  }

  // === LABELS ===

  getLabels(params?: any): Observable<PaginatedList<ShippingLabel>> {
    return this.http.get<any>('/api/shipping/labels', { params }).pipe(
      map(res => ({ ...res, items: res.items.map(this.toAdminLabel) }))
    );
  }

  createLabel(payload: any): Observable<ShippingLabel> {
    return this.http.post<ShippingLabelDto>('/api/shipping/labels', this.toApiPayload(payload)).pipe(
      map(this.toAdminLabel)
    );
  }

  purchaseLabel(id: string): Observable<ShippingLabel> {
    return this.http.post<ShippingLabelDto>(`/api/shipping/labels/${id}/purchase`, {}).pipe(
      map(this.toAdminLabel)
    );
  }

  // === PACKAGE PRESETS ===

  getPackagePresets(): Observable<PaginatedList<PackagePreset>> {
    return this.http.get<any>('/api/shipping/package-presets').pipe(
      map(res => ({ ...res, items: res.items.map(this.toAdminPreset) }))
    );
  }

  createPackagePreset(payload: any): Observable<PackagePreset> {
    return this.http.post<PackagePresetDto>('/api/shipping/package-presets', this.toApiPayload(payload)).pipe(
      map(this.toAdminPreset)
    );
  }

  // === PICKUPS ===

  getPickups(params?: any): Observable<PaginatedList<Pickup>> {
    return this.http.get<any>('/api/shipping/pickups', { params }).pipe(
      map(res => ({ ...res, items: res.items.map(this.toAdminPickup) }))
    );
  }

  schedulePickupsBulk(payload: any): Observable<any> {
    return this.http.post('/api/shipping/pickups/bulk', this.toApiPayload(payload));
  }

  // === NOTIFICATIONS ===

  getNotificationTemplates(): Observable<PaginatedList<NotificationTemplate>> {
    // Note: this comes from notification service
    return this.http.get<any>('/api/notifications/templates').pipe(
      map(res => ({ ...res, items: res.items.map(this.toAdminTemplate) }))
    );
  }

  notifyCustomer(shipmentId: string, payload: any): Observable<any> {
    return this.http.post(`/api/shipping/shipments/${shipmentId}/notify`, this.toApiPayload(payload));
  }

  // === MOCKS ===

  getMapPreviewUrl(origin: any, dest: any): Observable<string> {
    return this.mock.getMapPreviewUrl(origin, dest);
  }

  // === MAPPERS ===

  private toAdminShipment(dto: ShipmentDto): Shipment {
    return {
      id: dto.id,
      display_id: dto.displayId,
      order_id: dto.orderId,
      fulfillment_id: dto.fulfillmentId ?? undefined,
      status: dto.status,
      is_delayed: dto.isDelayed,
      delay_reason: dto.delayReason ?? undefined,
      carrier: dto.carrier,
      service_type: dto.serviceType ?? undefined,
      ship_date: dto.shipDate ?? undefined,
      origin_address: dto.originAddress,
      destination_address: dto.destinationAddress,
      departure_at: dto.departureAt ?? undefined,
      expected_arrival_at: dto.expectedArrivalAt ?? undefined,
      total_time_interval: dto.totalTimeInterval ?? undefined,
      current_stage: dto.currentStage,
      contact_email: dto.contactEmail ?? undefined,
      created_at: dto.createdAt,
      events: dto.events?.map((e) => ({
        id: e.id,
        kind: e.kind,
        description: e.description,
        location: e.location,
        occurred_at: e.occurredAt,
        carrier_event_id: e.carrierEventId
      }))
    };
  }

  private toAdminFulfillment(dto: FulfillmentDto): Fulfillment {
    return {
      id: dto.id,
      order_id: dto.orderId,
      notify_customer: dto.notifyCustomer,
      lines: dto.lines?.map((l) => ({
        fulfillment_id: l.fulfillmentId,
        order_line_id: l.orderLineId,
        qty: l.qty,
        weight_lb: l.weightLb
      })),
      tracking_numbers: dto.trackingNumbers?.map((t) => ({
        id: t.id,
        value: t.value
      }))
    };
  }

  private toAdminLabel(dto: ShippingLabelDto): ShippingLabel {
    return {
      id: dto.id,
      order_id: dto.orderId,
      carrier: dto.carrier,
      service_type: dto.serviceType,
      insurance: dto.insurance,
      ship_date: dto.shipDate,
      notify_customer: dto.notifyCustomer,
      return_address: dto.returnAddress,
      destination_address: dto.destinationAddress,
      subtotal_minor: dto.subtotalMinor,
      discount_minor: dto.discountMinor,
      total_minor: dto.totalMinor,
      label_file_id: dto.labelFileId,
      purchased_at: dto.purchasedAt,
      packages: dto.packages?.map((p) => ({
        id: p.id,
        order_line_id: p.orderLineId,
        package_preset_id: p.packagePresetId,
        package_name: p.packageName,
        package_type: p.packageType,
        item_weight_kg: p.itemWeightKg,
        total_weight_kg: p.totalWeightKg,
        length_cm: p.lengthCm,
        width_cm: p.widthCm,
        height_cm: p.heightCm,
        combined: p.combined
      }))
    };
  }

  private toAdminPreset(dto: PackagePresetDto): PackagePreset {
    return {
      id: dto.id,
      name: dto.name,
      package_type: dto.packageType,
      weight_kg: dto.weightKg,
      length_cm: dto.lengthCm,
      width_cm: dto.widthCm,
      height_cm: dto.heightCm
    };
  }

  private toAdminPickup(dto: PickupDto): Pickup {
    return {
      id: dto.id,
      shipment_id: dto.shipmentId,
      carrier: dto.carrier,
      pickup_date: dto.pickupDate,
      pickup_time: dto.pickupTime,
      meridiem: dto.meridiem,
      note: dto.note,
      status: dto.status
    };
  }

  private toAdminTemplate(dto: EmailTemplateDto): NotificationTemplate {
    return {
      id: dto.id,
      name: dto.name,
      subject: dto.subject ?? '',
      body: dto.body ?? '',
    };
  }

  private toApiPayload(model: any): any {
    if (!model) return model;
    if (Array.isArray(model)) return model.map(item => this.toApiPayload(item));
    if (typeof model !== 'object') return model;

    const payload: any = {};
    for (const key of Object.keys(model)) {
      const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
      payload[camelKey] = this.toApiPayload(model[key]);
    }
    return payload;
  }
}

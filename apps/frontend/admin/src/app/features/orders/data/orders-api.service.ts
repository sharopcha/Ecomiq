import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  Order,
  OrderLine,
  OrderTag,
  OrderComment,
  OrderStatus,
  OrderPaymentStatus,
  FulfillmentStatus,
  OrderStage,
  OrderChannelType,
} from './orders.models';
import { OrdersMockService } from './orders.mock-service';
import type { AdminOrderDto, AdminOrderCommentDto } from '@temp-nx/api-types/order';
import type { CursorPaginatedResponse } from '@temp-nx/api-types';

@Injectable({ providedIn: 'root' })
export class OrdersApiService {
  private readonly http = inject(HttpClient);
  private readonly mock = inject(OrdersMockService);

  private readonly base = '/api/orders';

  getOrders(params?: {
    status?: OrderStatus;
    paymentStatus?: OrderPaymentStatus;
    fulfillmentStatus?: FulfillmentStatus;
    limit?: number;
    cursor?: string;
  }): Observable<CursorPaginatedResponse<Order>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return this.http
      .get<CursorPaginatedResponse<AdminOrderDto>>(this.base, { params: httpParams })
      .pipe(
        map((res) => ({
          items: (res.items ?? []).map((o) => this.mapOrder(o)),
          nextCursor: res.nextCursor,
        }))
      );
  }

  getOrderById(id: string): Observable<Order | undefined> {
    return this.http
      .get<AdminOrderDto>(`${this.base}/${id}`)
      .pipe(map((o) => (o ? this.mapOrder(o) : undefined)));
  }

  createOrder(payload: any): Observable<Order> {
    return this.http.post<AdminOrderDto>(this.base, payload).pipe(map((o) => this.mapOrder(o)));
  }

  updateOrder(id: string, updates: any): Observable<Order> {
    return this.http.patch<AdminOrderDto>(`${this.base}/${id}`, updates).pipe(map((o) => this.mapOrder(o)));
  }

  confirmOrder(id: string): Observable<Order> {
    return this.http.post<AdminOrderDto>(`${this.base}/${id}/confirm`, {}).pipe(map((o) => this.mapOrder(o)));
  }

  cancelOrder(id: string, reason?: string): Observable<Order> {
    return this.http
      .post<AdminOrderDto>(`${this.base}/${id}/cancel`, { reason })
      .pipe(map((o) => this.mapOrder(o)));
  }

  advanceStage(id: string): Observable<Order> {
    return this.http.post<AdminOrderDto>(`${this.base}/${id}/stage/advance`, {}).pipe(map((o) => this.mapOrder(o)));
  }

  setNote(id: string, note: string | null): Observable<Order> {
    return this.http.patch<AdminOrderDto>(`${this.base}/${id}/note`, { note }).pipe(map((o) => this.mapOrder(o)));
  }

  addTag(id: string, tagId: string): Observable<Order> {
    return this.http.post<AdminOrderDto>(`${this.base}/${id}/tags`, { tagId }).pipe(map((o) => this.mapOrder(o)));
  }

  removeTag(id: string, tagId: string): Observable<Order> {
    return this.http.delete<AdminOrderDto>(`${this.base}/${id}/tags/${tagId}`).pipe(map((o) => this.mapOrder(o)));
  }

  getComments(orderId: string): Observable<OrderComment[]> {
    return this.http
      .get<AdminOrderCommentDto[]>(`${this.base}/${orderId}/comments`)
      .pipe(map((res) => (res ?? []).map((c) => this.mapComment(c))));
  }

  addComment(orderId: string, content: string): Observable<OrderComment> {
    return this.http
      .post<AdminOrderCommentDto>(`${this.base}/${orderId}/comments`, { body: content })
      .pipe(map((c) => this.mapComment(c)));
  }

  getCheckoutStatus(orderId: string): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.base}/${orderId}/checkout-status`);
  }

  // ── Delegated to mock ──────────────────────────────────────────────────────
  
  // crm-service
  getCustomer(id: string): Observable<any> {
    return this.mock.getCustomer(id);
  }

  // inventory-service
  reserveItem(variantId: string, locationId: string, qty: number): Observable<any> {
    return this.mock.reserveItem(variantId, locationId, qty);
  }

  getAvailableStock(variantId: string): Observable<any[]> {
    return this.mock.getAvailableStock(variantId);
  }

  // ── Mappers ──────────────────────────────────────────────────────────────
  private mapOrder(a: AdminOrderDto): Order {
    return {
      id: a.id,
      store_id: a.storeId,
      display_number: a.displayNumber,
      customer_id: a.customerId ?? undefined,
      channel_id: a.channelId ?? undefined,
      channel_type: a.channelType,
      status: a.status,
      payment_status: a.paymentStatus,
      fulfillment_status: a.fulfillmentStatus,
      stage: a.stage,
      order_date: a.orderDate,
      estimated_arrival_start: a.estimatedArrivalStart ?? undefined,
      estimated_arrival_end: a.estimatedArrivalEnd ?? undefined,
      subtotal_minor: a.subtotalMinor,
      shipping_type: a.shippingType ?? undefined,
      shipping_fee_minor: a.shippingFeeMinor,
      discount_minor: a.discountMinor,
      tax_minor: a.taxMinor,
      total_minor: a.totalMinor,
      currency: a.currency,
      note: a.note ?? undefined,
      shipping_address: a.shippingAddress ?? undefined,
      contact_email: a.contactEmail ?? undefined,
      contact_phone: a.contactPhone ?? undefined,
      canceled_at: a.canceledAt ?? undefined,
      cancel_reason: a.cancelReason ?? undefined,
      discount_id: a.discountId ?? undefined,
      discount_code: a.discountCode ?? undefined,
      payment_id: a.paymentId ?? undefined,
      lines: (a.lines ?? []).map((l) => ({
        id: l.id,
        variant_id: l.variantId,
        name: l.name,
        sku: l.sku ?? undefined,
        variant_label: l.variantLabel ?? undefined,
        qty: l.qty,
        fulfilled_qty: l.fulfilledQty,
        unit_price_minor: l.unitPriceMinor,
        image_file_id: l.imageFileId ?? undefined,
        reservation_id: l.reservationId ?? undefined,
      })),
      tags: (a.tags ?? []).map((t) => ({ id: t.id, name: t.name })),
    };
  }

  private mapComment(a: AdminOrderCommentDto): OrderComment {
    return {
      id: a.id,
      store_id: a.storeId,
      subject_table: a.subjectTable,
      subject_id: a.subjectId,
      content: a.body,
      author_id: a.authorId ?? '',
      created_at: a.createdAt,
    };
  }
}

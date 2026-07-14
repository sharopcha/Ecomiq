import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';
import {
  ReturnRequest,
  Refund,
  CreateReturnRequestDto,
  OrderComment,
  ReturnStatus,
  ReturnShipping,
  RefundStatus,
  RefundType,
  PaginatedList,
  ReturnProof,
  FileItem
} from './returns.models';
import { ReturnsMockService } from './returns.mock-service';
import type { AdminOrderCommentDto } from '@temp-nx/api-types/order';

@Injectable({ providedIn: 'root' })
export class ReturnsApiService {
  private readonly http = inject(HttpClient);
  private readonly mock = inject(ReturnsMockService);

  // ---------- RETURNS ----------

  getReturns(params?: any): Observable<PaginatedList<ReturnRequest>> {
    return this.http.get<any>('/api/orders/returns', { params }).pipe(
      map(res => ({
        ...res,
        items: res.items.map(this.toAdminReturn)
      }))
    );
  }

  getReturnById(id: string): Observable<ReturnRequest> {
    return this.http.get<any>(`/api/orders/returns/${id}`).pipe(
      map(this.toAdminReturn)
    );
  }

  createReturn(dto: CreateReturnRequestDto): Observable<ReturnRequest> {
    return this.http.post<any>('/api/orders/returns', dto).pipe(
      map(this.toAdminReturn)
    );
  }

  approveReturn(id: string): Observable<ReturnRequest> {
    return this.http.post<any>(`/api/orders/returns/${id}/approve`, {}).pipe(
      map(this.toAdminReturn)
    );
  }

  rejectReturn(id: string, reason?: string): Observable<ReturnRequest> {
    return this.http.post<any>(`/api/orders/returns/${id}/reject`, { reason }).pipe(
      map(this.toAdminReturn)
    );
  }

  inspectReturn(id: string): Observable<ReturnRequest> {
    return this.http.post<any>(`/api/orders/returns/${id}/inspect`, {}).pipe(
      map(this.toAdminReturn)
    );
  }

  resolveReturn(id: string, refundType: RefundType): Observable<ReturnRequest> {
    return this.http.post<any>(`/api/orders/returns/${id}/resolve`, { refundType }).pipe(
      map(this.toAdminReturn)
    );
  }

  advanceShippingStatus(id: string): Observable<ReturnRequest> {
    return this.http.post<any>(`/api/orders/returns/${id}/shipping-status/advance`, {}).pipe(
      map(this.toAdminReturn)
    );
  }

  // ---------- RETURN COMMENTS ----------

  getReturnComments(id: string): Observable<OrderComment[]> {
    return this.http.get<AdminOrderCommentDto[]>(`/api/orders/returns/${id}/comments`).pipe(
      map(res => (res ?? []).map(this.toAdminComment))
    );
  }

  addReturnComment(id: string, content: string): Observable<OrderComment> {
    return this.http.post<AdminOrderCommentDto>(`/api/orders/returns/${id}/comments`, { body: content }).pipe(
      map(this.toAdminComment)
    );
  }

  // ---------- REFUNDS ----------

  getOrderRefunds(orderId: string): Observable<PaginatedList<Refund>> {
    return this.http.get<any>(`/api/orders/${orderId}/refunds`).pipe(
      map(res => ({
        ...res,
        items: res.items.map(this.toAdminRefund)
      }))
    );
  }

  getRefundById(id: string): Observable<Refund> {
    return this.http.get<any>(`/api/orders/refunds/${id}`).pipe(
      map(this.toAdminRefund)
    );
  }

  approveRefund(id: string): Observable<Refund> {
    return this.http.post<any>(`/api/orders/refunds/${id}/approve`, {}).pipe(
      map(this.toAdminRefund)
    );
  }

  declineRefund(id: string, reason?: string): Observable<Refund> {
    return this.http.post<any>(`/api/orders/refunds/${id}/decline`, { reason }).pipe(
      map(this.toAdminRefund)
    );
  }

  // ---------- MOCKED MEDIA / FILE LIBRARY ----------
  // media-service does not exist yet

  getReturnProofs(returnId: string): Observable<ReturnProof[]> {
    return this.mock.getMockProofsForReturn(returnId);
  }

  getFileLibrary(): Observable<FileItem[]> {
    return this.mock.getMockFiles();
  }

  // ---------- MAPPERS ----------

  private toAdminReturn(dto: any): ReturnRequest {
    return {
      id: dto.id,
      display_id: dto.displayId,
      order_id: dto.order?.id || dto.orderId,
      customer_id: dto.customerId,
      status: dto.status as ReturnStatus,
      shipping_status: dto.shippingStatus as ReturnShipping,
      reason: dto.reason,
      requested_at: dto.requestedAt,
      approved_at: dto.approvedAt,
      rejected_at: dto.rejectedAt,
      resolved_at: dto.resolvedAt,
      expires_at: dto.expiresAt,
      inspected: dto.inspected,
      note: dto.note,
      lines: dto.lines?.map((l: any) => ({
        order_line_id: l.orderLine?.id || l.orderLineId,
        qty: l.qty
      })),
      proofs: [] // loaded separately via getReturnProofs
    };
  }

  private toAdminRefund(dto: any): Refund {
    return {
      id: dto.id,
      return_id: dto.returnRequest?.id,
      order_id: dto.order?.id || dto.orderId,
      payment_id: dto.paymentId,
      refund_type: dto.refundType as RefundType,
      amount_minor: dto.amountMinor,
      reason: dto.reason,
      message_to_customer: dto.messageToCustomer,
      send_info_to_customer: dto.sendInfoToCustomer,
      status: dto.status as RefundStatus,
      created_at: dto.createdAt,
      refunded_at: dto.refundedAt,
      failure_reason: dto.failureReason
    };
  }

  private toAdminComment(dto: AdminOrderCommentDto): OrderComment {
    return {
      id: dto.id,
      store_id: dto.storeId,
      subject_table: dto.subjectTable,
      subject_id: dto.subjectId,
      author_id: dto.authorId ?? '',
      content: dto.body,
      created_at: dto.createdAt
    };
  }
}

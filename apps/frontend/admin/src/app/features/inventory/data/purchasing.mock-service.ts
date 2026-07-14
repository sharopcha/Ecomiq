import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { PurchaseOrder } from './purchasing.models';

/**
 * MOCK: purchasing-service is a stub. All PO logic is simulated here.
 */
@Injectable({ providedIn: 'root' })
export class PurchasingMockService {
  private readonly pos: PurchaseOrder[] = [
    {
      id: 'po-1001', supplier_id: 'sup-001', supplier_name: 'Urban Deals', status: 'received',
      created_at: '2023-11-01T10:00:00Z', expected_delivery: '2023-11-05T10:00:00Z',
      total_amount_minor: 150000, items: []
    },
    {
      id: 'po-1002', supplier_id: 'sup-002', supplier_name: 'DealZone', status: 'shipped',
      created_at: '2023-11-20T14:30:00Z', expected_delivery: '2023-11-25T14:30:00Z',
      total_amount_minor: 345000, items: []
    },
    {
      id: 'po-1003', supplier_id: 'sup-005', supplier_name: 'iBox Indonesia - Pakuwon', status: 'pending',
      created_at: '2023-11-22T09:15:00Z', expected_delivery: '2023-11-28T09:15:00Z',
      total_amount_minor: 890000, items: []
    }
  ];

  getPurchaseOrders(): Observable<PurchaseOrder[]> {
    return of([...this.pos]).pipe(delay(200));
  }

  createPurchaseOrder(po: Partial<PurchaseOrder>): Observable<PurchaseOrder> {
    const newPo: PurchaseOrder = {
      id: `po-${1000 + this.pos.length + 1}`,
      supplier_id: po.supplier_id || '',
      supplier_name: po.supplier_name || 'Unknown Supplier',
      status: po.status || 'draft',
      created_at: new Date().toISOString(),
      expected_delivery: po.expected_delivery,
      total_amount_minor: po.total_amount_minor || 0,
      items: po.items || [],
      payment_terms: po.payment_terms,
      carrier: po.carrier,
      notes: po.notes
    };
    this.pos.unshift(newPo);
    return of(newPo).pipe(delay(300));
  }
}

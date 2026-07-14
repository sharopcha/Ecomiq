import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PurchaseOrder } from './purchasing.models';
import { PurchasingMockService } from './purchasing.mock-service';

/**
 * Seam for purchasing. Currently delegates entirely to mock.
 */
@Injectable({ providedIn: 'root' })
export class PurchasingApiService {
  private readonly mock = inject(PurchasingMockService);

  getPurchaseOrders(): Observable<PurchaseOrder[]> {
    return this.mock.getPurchaseOrders();
  }

  createPurchaseOrder(po: Partial<PurchaseOrder>): Observable<PurchaseOrder> {
    return this.mock.createPurchaseOrder(po);
  }
}

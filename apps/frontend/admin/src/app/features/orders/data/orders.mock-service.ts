import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OrdersMockService {
  
  // crm-service not implemented yet
  getCustomer(id: string): Observable<any> {
    return of({
      id,
      name: 'Michael Scott',
      email: 'michael.scott@dundermifflin.com',
      phone: '+1 555-123-4567',
      orders_count: 12,
      total_spent_minor: 450000,
    }).pipe(delay(300));
  }

  // inventory-service reservation endpoints
  reserveItem(variantId: string, locationId: string, qty: number): Observable<any> {
    return of({ success: true, variantId, locationId, qty }).pipe(delay(300));
  }

  getAvailableStock(variantId: string): Observable<any[]> {
    return of([
      { location_id: 'loc-1', location_name: 'Main Warehouse', available: 15 },
      { location_id: 'loc-2', location_name: 'Retail Store', available: 3 },
    ]).pipe(delay(300));
  }
}

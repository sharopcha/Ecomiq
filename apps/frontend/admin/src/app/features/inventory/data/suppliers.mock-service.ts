import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { Supplier, SupplierReview } from './inventory-models';

/**
 * ⚠️ MOCK — there is no Supplier entity/API anywhere in the backend yet
 * (handover §5). `ReorderRule.preferredSupplierId` is an opaque string a
 * future purchasing-service will interpret. Same pattern as
 * `products.mock-service.ts`: swap this seam for a real client later without
 * touching components.
 *
 * Data mirrors the Supplier workspace screenshots (17.55.36 / 17.56.03).
 */
@Injectable({ providedIn: 'root' })
export class SuppliersMockService {
  private readonly suppliers: Supplier[] = [
    { 
      id: 'sup-001', name: 'Urban Deals', phone: '+(22)-789-907', email: 'urbandeals@gmail.com', location: 'Caturtunggal', total_products: 56, is_active: true,
      avatar_url: 'https://ui-avatars.com/api/?name=Urban+Deals&background=F16D22&color=fff', joined_date: '2023-01-15T00:00:00Z', last_login: '2023-11-20T10:30:00Z',
      description: 'Specializes in urban electronics and lifestyle products.', rating: 4.3, website: 'www.urbandeals.com', shipping_carriers: ['FedEx', 'DHL']
    },
    { 
      id: 'sup-002', name: 'DealZone', phone: '+(22)-464-983', email: 'dealszone@gmail.com', location: 'Yogyakarta', total_products: 12, is_active: true,
      avatar_url: 'https://ui-avatars.com/api/?name=Deal+Zone&background=0284C7&color=fff', joined_date: '2022-06-11T00:00:00Z', last_login: '2023-10-05T08:15:00Z',
      description: 'Top tech gadgets provider.', rating: 4.8, website: 'www.dealzone.id', shipping_carriers: ['JNE', 'SiCepat']
    },
    { id: 'sup-003', name: 'BuyRight', phone: '+(22)-332-745', email: 'buyright@gmail.com', location: 'Gejayan', total_products: 34, is_active: false },
    { id: 'sup-004', name: 'Trendline - Pakuwon', phone: '+(22)-863-948', email: 'Trendlinepkwn@gmail.com', location: 'Caturtunggal', total_products: 14, is_active: true },
    { id: 'sup-005', name: 'iBox Indonesia - Pakuwon', phone: '+(22)-746-029', email: 'iboxindopkwn@gmail.com', location: 'Yogyakarta', total_products: 70, is_active: true },
    { id: 'sup-006', name: 'MetroShop', phone: '+(22)-876-263', email: 'metroshop@gmail.com', location: 'Klaten', total_products: 112, is_active: true },
    { id: 'sup-007', name: 'Urban Deals - Central Park', phone: '+(22)-837-989', email: 'urbandeals@gmail.com', location: 'Yogyakarta', total_products: 245, is_active: true },
    { id: 'sup-008', name: 'Urban Deals - Ambarrukmo Plaza', phone: '+(22)-223-927', email: 'urbandelasambar@gmail.com', location: 'Yogyakarta', total_products: 567, is_active: true },
    { id: 'sup-009', name: 'Urban Deals - Surabaya', phone: '+(22)-232-873', email: 'urbandealssby@gmail.com', location: 'Jakarta', total_products: 124, is_active: false },
    { id: 'sup-010', name: 'ShopEase', phone: '+(22)-873-749', email: 'shopease@gmail.com', location: 'Kediri', total_products: 321, is_active: true },
    { id: 'sup-011', name: 'Trendline - Gejayan', phone: '+(22)-049-229', email: 'trendlinegjyn@gmail.com', location: 'Magelang', total_products: 98, is_active: true },
    { id: 'sup-012', name: 'Urban Deals - Artos', phone: '+(22)-334-928', email: 'urbndealsartoz@gmail.com', location: 'Purwokerto', total_products: 78, is_active: true },
  ];

  private readonly reviews: SupplierReview[] = [
    { id: 'rev-1', author_name: 'John Doe', author_avatar: 'https://i.pravatar.cc/150?u=1', stars: 5, title: 'Excellent Service', body: 'The products were delivered on time and in perfect condition.', timestamp: '2023-11-15T14:30:00Z' },
    { id: 'rev-2', author_name: 'Jane Smith', author_avatar: 'https://i.pravatar.cc/150?u=2', stars: 4, title: 'Good Quality', body: 'Products are good but shipping took a bit longer than expected.', timestamp: '2023-11-10T09:15:00Z' },
    { id: 'rev-3', author_name: 'Mike Johnson', author_avatar: 'https://i.pravatar.cc/150?u=3', stars: 5, title: 'Great partner', body: 'Have been ordering from them for 2 years without issue.', timestamp: '2023-10-25T11:45:00Z' }
  ];

  getSuppliers(): Observable<Supplier[]> {
    return of([...this.suppliers]).pipe(delay(150));
  }

  getSupplierById(id: string): Observable<Supplier | undefined> {
    return of(this.suppliers.find((s) => s.id === id)).pipe(delay(100));
  }

  getSupplierReviews(supplierId: string): Observable<SupplierReview[]> {
    return of([...this.reviews]).pipe(delay(150));
  }

  /** Deterministic mock join for the Inventory list's Supplier column —
   *  nothing real to join against until a purchasing-service exists. */
  getSupplierForVariant(variantId: string): Supplier {
    let hash = 0;
    for (let i = 0; i < variantId.length; i++) hash = (hash * 31 + variantId.charCodeAt(i)) >>> 0;
    return this.suppliers[hash % this.suppliers.length];
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { RatingModule } from 'primeng/rating';
import { SkeletonModule } from 'primeng/skeleton';
import { FormsModule } from '@angular/forms';

import { SuppliersMockService } from '../data/suppliers.mock-service';
import { CatalogApiService } from '../../products/data/catalog-api.service';
import { Supplier, SupplierReview } from '../data/inventory-models';
import { Product } from '../../products/data/products.models';
import { combineLatest } from 'rxjs';

@Component({
  selector: 'app-supplier-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    TableModule,
    TabsModule,
    TagModule,
    RatingModule,
    SkeletonModule,
    FormsModule
  ],
  templateUrl: './supplier-detail.component.html'
})
export class SupplierDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly suppliersApi = inject(SuppliersMockService);
  private readonly catalogApi = inject(CatalogApiService);

  readonly supplier = signal<Supplier | null>(null);
  readonly products = signal<Product[]>([]);
  readonly reviews = signal<SupplierReview[]>([]);
  readonly loading = signal(true);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    combineLatest([
      this.suppliersApi.getSupplierById(id),
      this.suppliersApi.getSupplierReviews(id),
      this.catalogApi.getProducts()
    ]).subscribe({
      next: ([supplier, reviews, allProducts]) => {
        if (!supplier) {
          this.router.navigate(['/inventory/suppliers']);
          return;
        }
        this.supplier.set(supplier);
        this.reviews.set(reviews);
        
        // Mock filtering products for this supplier. In reality, purchasing-service/catalog-service
        // would relate products to suppliers. We'll just grab the first N products.
        const numProducts = Math.min(allProducts.length, supplier.total_products || 10);
        this.products.set(allProducts.slice(0, numProducts));
        
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  goBack() {
    this.location.back();
  }

  createPurchaseOrder() {
    this.router.navigate(['/inventory/purchasing/new'], { queryParams: { supplierId: this.supplier()?.id } });
  }
}

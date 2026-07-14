import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';

import { PurchasingApiService } from '../data/purchasing-api.service';
import { SuppliersMockService } from '../data/suppliers.mock-service';
import { CatalogApiService } from '../../products/data/catalog-api.service';
import { EmailComposerComponent } from '../../../shared/components/email-composer.component';
import { Supplier } from '../data/inventory-models';
import { Product } from '../../products/data/products.models';

@Component({
  selector: 'app-create-po-wizard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, InputTextModule, 
    SelectModule, TextareaModule, DatePickerModule, TableModule, EmailComposerComponent
  ],
  templateUrl: './create-po-wizard.component.html'
})
export class CreatePoWizardComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly purchasingApi = inject(PurchasingApiService);
  private readonly suppliersApi = inject(SuppliersMockService);
  private readonly catalogApi = inject(CatalogApiService);

  readonly suppliers = signal<Supplier[]>([]);
  readonly products = signal<Product[]>([]);

  step = signal<number>(1);

  // Step 1: Details
  selectedSupplier = signal<Supplier | null>(null);
  expectedDate = signal<Date | null>(null);
  carrier = signal<string>('');
  paymentTerms = signal<string>('Net 30');
  notes = signal<string>('');

  // Step 2: Products
  poItems = signal<any[]>([]);

  ngOnInit() {
    this.suppliersApi.getSuppliers().subscribe(res => {
      this.suppliers.set(res);
      // Auto-select if supplierId is in query
      const prefillId = this.route.snapshot.queryParamMap.get('supplierId');
      if (prefillId) {
        const found = res.find(s => s.id === prefillId);
        if (found) this.selectedSupplier.set(found);
      }
    });
    this.catalogApi.getProducts().subscribe(res => this.products.set(res));
  }

  goBack() {
    this.location.back();
  }

  addProduct(product: Product) {
    const current = this.poItems();
    const existing = current.find(i => i.product_id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      current.push({
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        qty: 1,
        unit_cost_minor: product.cost_minor || product.price_minor || 0
      });
    }
    this.poItems.set([...current]);
  }

  removeProduct(index: number) {
    const current = this.poItems();
    current.splice(index, 1);
    this.poItems.set([...current]);
  }

  getTotalAmountMinor(): number {
    return this.poItems().reduce((acc, item) => acc + (item.qty * item.unit_cost_minor), 0);
  }

  get emailBody(): string {
    const totalStr = (this.getTotalAmountMinor() / 100).toFixed(2);
    const dateStr = this.expectedDate() ? this.expectedDate()!.toLocaleDateString() : 'TBD';
    return `Dear ${this.selectedSupplier()?.name || 'Supplier'},\n\nPlease find attached the new purchase order.\n\nTotal: $${totalStr}\nExpected Delivery: ${dateStr}\n\nBest regards,\nEcomiq Purchasing`;
  }

  submitPO() {
    this.purchasingApi.createPurchaseOrder({
      supplier_id: this.selectedSupplier()?.id,
      supplier_name: this.selectedSupplier()?.name,
      expected_delivery: this.expectedDate()?.toISOString(),
      carrier: this.carrier(),
      payment_terms: this.paymentTerms(),
      notes: this.notes(),
      total_amount_minor: this.getTotalAmountMinor(),
      items: this.poItems(),
      status: 'pending' // Usually starts as pending when sent
    }).subscribe(() => {
      this.router.navigate(['/inventory/purchasing']);
    });
  }
}

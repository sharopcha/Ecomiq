import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SuppliersMockService } from '../data/suppliers.mock-service';
import { Supplier } from '../data/inventory-models';

/**
 * ⚠️ Supplier directory (screenshot 17.55.36) — MOCK DATA ONLY.
 * There is no Supplier entity/API anywhere in the backend (handover §5);
 * `ReorderRule.preferredSupplierId` is an opaque string for a future
 * purchasing-service. This screen is a visual reference wired to
 * `SuppliersMockService` — swap the seam once a real API exists.
 */
@Component({
  selector: 'app-suppliers-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule],
  templateUrl: './suppliers-list.component.html',
})
export class SuppliersListComponent implements OnInit {
  private readonly mock = inject(SuppliersMockService);

  readonly suppliers = signal<Supplier[]>([]);
  readonly searchQuery = signal<string>('');

  readonly filteredSuppliers = computed(() => {
    const search = this.searchQuery().toLowerCase().trim();
    if (!search) return this.suppliers();
    return this.suppliers().filter(
      (s) => s.name.toLowerCase().includes(search) || s.location.toLowerCase().includes(search),
    );
  });

  ngOnInit() {
    this.mock.getSuppliers().subscribe((s) => this.suppliers.set(s));
  }
}

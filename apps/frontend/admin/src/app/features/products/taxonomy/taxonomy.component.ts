import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { CatalogApiService } from '../data/catalog-api.service';
import { Category, ProductType, Vendor } from '../data/products.models';

type Tab = 'categories' | 'vendors' | 'types';

@Component({
  selector: 'app-taxonomy',
  standalone: true,
  imports: [FormsModule, ButtonModule, TableModule, TabsModule, DialogModule, InputTextModule, SelectModule, MessageModule],
  templateUrl: './taxonomy.component.html',
})
export class TaxonomyComponent implements OnInit {
  private readonly api = inject(CatalogApiService);

  readonly activeTab = signal<Tab>('categories');

  readonly categories = signal<Category[]>([]);
  readonly vendors = signal<Vendor[]>([]);
  readonly productTypes = signal<ProductType[]>([]);

  readonly loading = signal(true);

  readonly currentList = computed<{ id: string; name: string }[]>(() => {
    switch (this.activeTab()) {
      case 'categories': return this.categories();
      case 'vendors': return this.vendors();
      case 'types': return this.productTypes();
    }
  });

  // Parent-category options for the Categories dialog (excludes the item being edited).
  readonly parentOptions = computed(() =>
    this.categories().filter((c) => c.id !== this.editing()?.id),
  );

  // Dialog state
  readonly showDialog = signal(false);
  readonly editing = signal<{ id: string; name: string; parent_id?: string } | null>(null);
  readonly name = signal('');
  readonly parentId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly dialogError = signal<string | null>(null);

  ngOnInit() {
    this.fetchAll();
  }

  fetchAll() {
    this.loading.set(true);
    this.api.getCategories().subscribe((c) => this.categories.set(c));
    this.api.getVendors().subscribe((v) => this.vendors.set(v));
    this.api.getProductTypes().subscribe((t) => {
      this.productTypes.set(t);
      this.loading.set(false);
    });
  }

  tabLabel(): string {
    switch (this.activeTab()) {
      case 'categories': return 'Category';
      case 'vendors': return 'Vendor';
      case 'types': return 'Product Type';
    }
  }

  openCreate() {
    this.editing.set(null);
    this.name.set('');
    this.parentId.set(null);
    this.dialogError.set(null);
    this.showDialog.set(true);
  }

  openEdit(item: { id: string; name: string; parent_id?: string }) {
    this.editing.set(item);
    this.name.set(item.name);
    this.parentId.set(item.parent_id ?? null);
    this.dialogError.set(null);
    this.showDialog.set(true);
  }

  save() {
    const trimmed = this.name().trim();
    if (!trimmed || this.saving()) return;
    this.saving.set(true);
    this.dialogError.set(null);

    const editing = this.editing();
    const tab = this.activeTab();

    const request$ =
      tab === 'categories'
        ? editing
          ? this.api.updateCategory(editing.id, { name: trimmed, parent_id: this.parentId() ?? undefined })
          : this.api.createCategory({ name: trimmed, parent_id: this.parentId() ?? undefined })
        : tab === 'vendors'
          ? editing
            ? this.api.updateVendor(editing.id, { name: trimmed })
            : this.api.createVendor({ name: trimmed })
          : editing
            ? this.api.updateProductType(editing.id, { name: trimmed })
            : this.api.createProductType({ name: trimmed });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.showDialog.set(false);
        this.fetchAll();
      },
      error: () => {
        this.saving.set(false);
        this.dialogError.set(`Failed to save this ${this.tabLabel().toLowerCase()}. Please try again.`);
      },
    });
  }

  delete(item: { id: string; name: string }) {
    if (!confirm(`Delete "${item.name}"? This fails if it's still assigned to a product.`)) return;

    const tab = this.activeTab();
    const request$ =
      tab === 'categories'
        ? this.api.deleteCategory(item.id)
        : tab === 'vendors'
          ? this.api.deleteVendor(item.id)
          : this.api.deleteProductType(item.id);

    request$.subscribe({
      next: () => this.fetchAll(),
      error: () => alert(`Could not delete "${item.name}" — it may still be in use by a product.`),
    });
  }

  parentName(id?: string): string | null {
    if (!id) return null;
    return this.categories().find((c) => c.id === id)?.name ?? null;
  }
}

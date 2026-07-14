import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { CatalogApiService } from '../data/catalog-api.service';
import { Product, Category, ProductType, ProductStatus } from '../data/products.models';
import { PerformanceDetailsDialogComponent } from '../components/performance-details-dialog.component';
import { AddProductVariantsDialogComponent } from '../components/add-product-variants-dialog.component';
import { ConfigureAlertDialogComponent } from '../components/configure-alert-dialog.component';

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    SelectModule,
    TableModule,
    TagModule,
    MenuModule,
    PerformanceDetailsDialogComponent,
    AddProductVariantsDialogComponent,
    ConfigureAlertDialogComponent,
  ],
  templateUrl: './products-list.component.html',
})
export class ProductsListComponent implements OnInit {
  private readonly mockService = inject(CatalogApiService);
  private readonly router = inject(Router);

  // Raw mock lists
  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly productTypes = signal<ProductType[]>([]);

  // Filtering states
  readonly activeTab = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<string | null>(null);
  readonly selectedType = signal<string | null>(null);
  readonly viewMode = signal<'grid' | 'table'>('grid');

  // Dialog control states
  readonly performanceProduct = signal<Product | null>(null);
  readonly showPerformanceDialog = signal<boolean>(false);
  readonly variantsProduct = signal<Product | null>(null);
  readonly showVariantsDialog = signal<boolean>(false);
  readonly showAlertConfigDialog = signal<boolean>(false);

  // Selected product for dropdown menus
  readonly menuTargetProduct = signal<Product | null>(null);

  // Stock tracking rolled-up cache
  readonly productStockCache = signal<Record<string, { count: number; status: 'High' | 'Low' | 'Out of Stock' }>>({});

  // Category and Type options
  readonly categoryOptions = computed(() => [
    { label: 'All Categories', value: null },
    ...this.categories().map(c => ({ label: c.name, value: c.id }))
  ]);

  readonly typeOptions = computed(() => [
    { label: 'All Types', value: null },
    ...this.productTypes().map(t => ({ label: t.name, value: t.id }))
  ]);

  // Context menu items
  readonly productMenuItems: MenuItem[] = [
    {
      label: 'Actions',
      items: [
        {
          label: 'Edit Details',
          icon: 'pi pi-pencil',
          command: () => {
            const p = this.menuTargetProduct();
            if (p) this.router.navigate(['/products', p.id]);
          }
        },
        {
          label: 'Manage Variants',
          icon: 'pi pi-tags',
          command: () => {
            const p = this.menuTargetProduct();
            if (p) this.openVariantsDialog(p);
          }
        },
        {
          label: 'View Analytics',
          icon: 'pi pi-chart-line',
          command: () => {
            const p = this.menuTargetProduct();
            if (p) this.openPerformanceDialog(p);
          }
        },
        {
          label: 'Delete Product',
          icon: 'pi pi-trash',
          styleClass: 'text-red-400 hover:text-red-300',
          command: () => {
            const p = this.menuTargetProduct();
            if (p) this.deleteProduct(p.id);
          }
        }
      ]
    }
  ];

  // Computed filtered list
  readonly filteredProducts = computed(() => {
    let list = this.products();
    
    // Tab Status Filter
    const tab = this.activeTab();
    if (tab !== 'all') {
      list = list.filter(p => p.status === tab);
    }

    // Search Query Filter
    const search = this.searchQuery().toLowerCase().trim();
    if (search) {
      list = list.filter(p => 
        p.name.toLowerCase().includes(search) || 
        (p.sku && p.sku.toLowerCase().includes(search))
      );
    }

    // Category Filter
    const cat = this.selectedCategory();
    if (cat) {
      list = list.filter(p => p.category_id === cat);
    }

    // Type Filter
    const type = this.selectedType();
    if (type) {
      list = list.filter(p => p.type_id === type);
    }

    return list;
  });

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.mockService.getProducts().subscribe((list) => {
      this.products.set(list);
      // Cache stock levels for products
      list.forEach(p => {
        this.mockService.getProductTotalStock(p.id).subscribe(stk => {
          this.productStockCache.update(cache => ({
            ...cache,
            [p.id]: stk
          }));
        });
      });
    });

    this.mockService.getCategories().subscribe(c => this.categories.set(c));
    this.mockService.getProductTypes().subscribe(t => this.productTypes.set(t));
  }

  getCategoryName(id?: string): string {
    return this.categories().find(c => c.id === id)?.name ?? 'None';
  }

  getTypeName(id?: string): string {
    return this.productTypes().find(t => t.id === id)?.name ?? 'None';
  }

  setTab(tab: string) {
    this.activeTab.set(tab);
  }

  toggleViewMode() {
    this.viewMode.update(mode => mode === 'grid' ? 'table' : 'grid');
  }

  // Dialog triggers
  openPerformanceDialog(product: Product) {
    this.performanceProduct.set(product);
    this.showPerformanceDialog.set(true);
  }

  openVariantsDialog(product: Product) {
    this.variantsProduct.set(product);
    this.showVariantsDialog.set(true);
  }

  openAlertConfig() {
    this.showAlertConfigDialog.set(true);
  }

  setMenuTarget(product: Product, event: any, menu: any) {
    this.menuTargetProduct.set(product);
    menu.toggle(event);
  }

  deleteProduct(id: string) {
    if (confirm('Are you sure you want to delete this product?')) {
      this.mockService.deleteProduct(id).subscribe(() => {
        this.loadData();
      });
    }
  }

  reorderProduct(product: Product) {
    alert(`Reorder purchase order triggered for ${product.name} supplier.`);
  }
}

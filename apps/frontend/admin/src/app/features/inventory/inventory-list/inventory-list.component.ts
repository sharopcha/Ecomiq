import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { InventoryApiService } from '../data/inventory-api.service';
import { SuppliersMockService } from '../data/suppliers.mock-service';
import { InventoryLocation, StockLevelListItem, StockStatus } from '../data/inventory-models';
import { AuditStockDialogComponent } from '../components/audit-stock-dialog.component';
import { CreateStockAlertDialogComponent } from '../components/create-stock-alert-dialog.component';
import { SetReorderDialogComponent } from '../components/set-reorder-dialog.component';
import { ReserveItemDialogComponent } from '../components/reserve-item-dialog.component';
import { StockHistoryDialogComponent } from '../components/stock-history-dialog.component';

/**
 * Inventory list (screenshot 17.53.43) — one row per variant, aggregated
 * across warehouses unless a location filter is applied (then rows carry a
 * real stock_level.id).
 *
 * Note: the screenshot's date-range filter has no backend equivalent (stock
 * levels aren't time-scoped) — omitted per scope decision; see
 * handover-backend-requests.md.
 */
@Component({
  selector: 'app-inventory-list',
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
    AuditStockDialogComponent,
    CreateStockAlertDialogComponent,
    SetReorderDialogComponent,
    ReserveItemDialogComponent,
    StockHistoryDialogComponent,
  ],
  templateUrl: './inventory-list.component.html',
})
export class InventoryListComponent implements OnInit {
  private readonly api = inject(InventoryApiService);
  private readonly suppliersMock = inject(SuppliersMockService);

  // Data
  readonly rows = signal<StockLevelListItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly loadingMore = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);
  readonly locations = signal<InventoryLocation[]>([]);

  // Filters (server-side — every change refetches from page one)
  readonly searchQuery = signal<string>('');
  readonly selectedLocation = signal<string | null>(null);
  readonly selectedCategory = signal<string | null>(null);
  readonly selectedStockLevel = signal<StockStatus | null>(null);

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  // Dialog control
  readonly menuTargetRow = signal<StockLevelListItem | null>(null);
  readonly showAuditDialog = signal<boolean>(false);
  readonly showAlertDialog = signal<boolean>(false);
  readonly showReorderDialog = signal<boolean>(false);
  readonly showReserveDialog = signal<boolean>(false);
  readonly showHistoryDialog = signal<boolean>(false);

  readonly locationOptions = computed(() => [
    { label: 'All Warehouses', value: null as string | null },
    ...this.locations().map((l) => ({ label: l.name, value: l.id as string | null })),
  ]);

  /** Category options accumulate from rows already loaded — the stock-levels
   *  response carries categoryId/categoryName pre-joined (handover §5). */
  private readonly seenCategories = signal<Record<string, string>>({});
  readonly categoryOptions = computed(() => [
    { label: 'All Categories', value: null as string | null },
    ...Object.entries(this.seenCategories()).map(([id, name]) => ({ label: name, value: id as string | null })),
  ]);

  readonly stockLevelOptions: { label: string; value: StockStatus | null }[] = [
    { label: 'All Stock Levels', value: null },
    { label: 'High', value: 'high' },
    { label: 'Low', value: 'low' },
    { label: 'Out of Stock', value: 'out' },
  ];

  readonly rowMenuItems: MenuItem[] = [
    {
      label: 'Actions',
      items: [
        { label: 'Reorder', icon: 'pi pi-refresh', command: () => this.showReorderDialog.set(true) },
        { label: 'Audit Stock', icon: 'pi pi-check-square', command: () => this.showAuditDialog.set(true) },
        { label: 'Create Stock Alert', icon: 'pi pi-bell', command: () => this.showAlertDialog.set(true) },
        { label: 'Reserve Item', icon: 'pi pi-lock', command: () => this.showReserveDialog.set(true) },
        { label: 'Stock History', icon: 'pi pi-history', command: () => this.showHistoryDialog.set(true) },
      ],
    },
  ];

  ngOnInit() {
    this.api.getLocations(null, 100).subscribe((page) => this.locations.set(page.items));
    this.fetch();
  }

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.fetch(), 300);
  }

  onFilterChange() {
    this.fetch();
  }

  fetch() {
    this.loading.set(true);
    this.loadError.set(null);
    this.api
      .getStockLevels({
        locationId: this.selectedLocation(),
        categoryId: this.selectedCategory(),
        stockLevel: this.selectedStockLevel(),
        search: this.searchQuery().trim() || null,
        limit: 20,
      })
      .subscribe({
        next: (page) => {
          this.rows.set(page.items);
          this.nextCursor.set(page.next_cursor);
          this.rememberCategories(page.items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('Failed to load inventory. Please try again.');
        },
      });
  }

  loadMore() {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api
      .getStockLevels({
        locationId: this.selectedLocation(),
        categoryId: this.selectedCategory(),
        stockLevel: this.selectedStockLevel(),
        search: this.searchQuery().trim() || null,
        cursor,
        limit: 20,
      })
      .subscribe({
        next: (page) => {
          this.rows.update((rows) => [...rows, ...page.items]);
          this.nextCursor.set(page.next_cursor);
          this.rememberCategories(page.items);
          this.loadingMore.set(false);
        },
        error: () => this.loadingMore.set(false),
      });
  }

  private rememberCategories(items: StockLevelListItem[]) {
    this.seenCategories.update((seen) => {
      const next = { ...seen };
      for (const item of items) {
        if (item.category_id && item.category_name) next[item.category_id] = item.category_name;
      }
      return next;
    });
  }

  /** ⚠️ Mock join — no Supplier backend exists (handover §5). */
  supplierName(row: StockLevelListItem): string {
    return this.suppliersMock.getSupplierForVariant(row.variant_id).name;
  }

  statusLabel(status: StockStatus): string {
    return status === 'out' ? 'Out of Stock' : status === 'low' ? 'Low' : 'High';
  }

  setMenuTarget(row: StockLevelListItem, event: Event, menu: { toggle: (e: Event) => void }) {
    this.menuTargetRow.set(row);
    menu.toggle(event);
  }

  onActionCompleted() {
    this.fetch();
  }
}

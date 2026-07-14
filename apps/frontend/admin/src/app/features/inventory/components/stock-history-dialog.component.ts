import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';
import { InventoryApiService } from '../data/inventory-api.service';
import { StockLevelListItem, StockMovement, StockMovementKind } from '../data/inventory-models';

/**
 * "Stock History" row action — read-only movements ledger
 * (`GET /stock-movements?variantId=`). Movements are only ever created
 * internally (audits, reservations, reorder receipts); there is no write UI.
 *
 * Date-range filter (screenshot 17.53.43's "2 Feb - 14 Apr" control, which
 * has no equivalent on the stock-levels list since it isn't time-scoped —
 * lives here instead, on the ledger that actually is, via the backend's
 * `createdFrom`/`createdTo` params — see handover-backend-requests.md §1).
 */
@Component({
  selector: 'app-stock-history-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, TableModule, TagModule, DatePickerModule],
  templateUrl: './stock-history-dialog.component.html',
})
export class StockHistoryDialogComponent implements OnInit {
  private readonly api = inject(InventoryApiService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input({ required: true }) row!: StockLevelListItem;

  readonly movements = signal<StockMovement[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly loadingMore = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);

  /** `[from, to]` — either end may be null while the range is still open. */
  readonly dateRange = signal<Date[] | null>(null);

  private readonly kindMeta: Record<StockMovementKind, { label: string; icon: string }> = {
    sale: { label: 'Sale', icon: 'pi pi-shopping-cart' },
    return: { label: 'Return', icon: 'pi pi-undo' },
    purchase_receipt: { label: 'Purchase Receipt', icon: 'pi pi-file-import' },
    adjustment: { label: 'Adjustment', icon: 'pi pi-sliders-h' },
    reservation: { label: 'Reservation', icon: 'pi pi-lock' },
    release: { label: 'Release', icon: 'pi pi-lock-open' },
    transfer: { label: 'Transfer', icon: 'pi pi-arrows-h' },
  };

  ngOnInit() {
    this.fetch();
  }

  fetch() {
    this.loading.set(true);
    this.loadError.set(null);
    this.api
      .getStockMovements({ variantId: this.row.variant_id, limit: 20, ...this.dateBounds() })
      .subscribe({
        next: (page) => {
          this.movements.set(page.items);
          this.nextCursor.set(page.next_cursor);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('Failed to load stock movements.');
        },
      });
  }

  loadMore() {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api
      .getStockMovements({ variantId: this.row.variant_id, cursor, limit: 20, ...this.dateBounds() })
      .subscribe({
        next: (page) => {
          this.movements.update((items) => [...items, ...page.items]);
          this.nextCursor.set(page.next_cursor);
          this.loadingMore.set(false);
        },
        error: () => this.loadingMore.set(false),
      });
  }

  /** Called on p-datepicker range selection — both dates are only known once the second click lands. */
  onDateRangeChange(range: Date[] | null) {
    this.dateRange.set(range);
    if (!range || (range[0] && range[1])) {
      // Refetch once the range is either cleared or fully picked (both ends set).
      this.fetch();
    }
  }

  clearDateRange() {
    this.dateRange.set(null);
    this.fetch();
  }

  /** `createdFrom` = start of the first picked day; `createdTo` = end of the second — inclusive bounds matching the backend's `created_at >= / <=` filter. */
  private dateBounds(): { createdFrom?: string; createdTo?: string } {
    const range = this.dateRange();
    const from = range?.[0] ?? null;
    const to = range?.[1] ?? null;
    if (!from || !to) return {};
    const startOfDay = new Date(from);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);
    return { createdFrom: startOfDay.toISOString(), createdTo: endOfDay.toISOString() };
  }

  kindLabel(kind: StockMovementKind): string {
    return this.kindMeta[kind]?.label ?? kind;
  }

  kindIcon(kind: StockMovementKind): string {
    return this.kindMeta[kind]?.icon ?? 'pi pi-circle';
  }

  close() {
    this.visibleChange.emit(false);
  }
}

import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { InventoryApiService } from '../data/inventory-api.service';
import {
  InventoryLocation,
  StockAudit,
  StockAuditAdjustType,
  StockAuditReason,
  StockLevelListItem,
} from '../data/inventory-models';

/**
 * Audit Stock modal (screenshot 17.54.00) — two-tab Quantity/Value adjustment
 * with the append-only "Stock adjustment history" right rail
 * (`GET /stock-audits?variantId=`).
 *
 * Needs a concrete stock_level.id: aggregated list rows carry `id: null`, so
 * the user picks a warehouse and we resolve the id via the API service.
 */
@Component({
  selector: 'app-audit-stock-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
  ],
  templateUrl: './audit-stock-dialog.component.html',
})
export class AuditStockDialogComponent implements OnInit {
  private readonly api = inject(InventoryApiService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input({ required: true }) row!: StockLevelListItem;
  @Input() locations: InventoryLocation[] = [];
  /** When the list is already scoped to a warehouse, preselect it. */
  @Input() preselectedLocationId: string | null = null;
  @Output() auditSaved = new EventEmitter<void>();

  readonly adjustType = signal<StockAuditAdjustType>('quantity');
  readonly physicalCount = signal<number | null>(null);
  /** Decimal in the UI; converted to minor units for the service. */
  readonly valueDelta = signal<number | null>(null);
  readonly reason = signal<StockAuditReason>('damage');
  readonly note = signal<string>('');

  readonly selectedLocationId = signal<string | null>(null);
  readonly resolvedStockLevelId = signal<string | null>(null);
  readonly resolving = signal<boolean>(false);

  readonly history = signal<StockAudit[]>([]);
  readonly historyLoading = signal<boolean>(false);
  /** `[from, to]` — same range-picker convention as the Stock History dialog. */
  readonly historyDateRange = signal<Date[] | null>(null);

  readonly saving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly reasons: { label: string; value: StockAuditReason; icon: string }[] = [
    { label: 'Damage', value: 'damage', icon: 'pi pi-box' },
    { label: 'Expire', value: 'expire', icon: 'pi pi-clock' },
    { label: 'Misplacement', value: 'misplacement', icon: 'pi pi-map-marker' },
    { label: 'Thief', value: 'thief', icon: 'pi pi-exclamation-triangle' },
    { label: 'Stocktake Variance', value: 'stocktake_variance', icon: 'pi pi-calculator' },
    { label: 'Custom', value: 'custom', icon: 'pi pi-pencil' },
  ];

  get locationOptions() {
    return this.locations.map((l) => ({ label: l.name, value: l.id }));
  }

  get discrepancy(): number | null {
    const count = this.physicalCount();
    if (count === null) return null;
    return count - this.row.available;
  }

  ngOnInit() {
    // Aggregated row (id null) → warehouse must be picked to resolve the cell.
    if (this.row.id) {
      this.resolvedStockLevelId.set(this.row.id);
    } else if (this.preselectedLocationId) {
      this.onLocationChange(this.preselectedLocationId);
    } else {
      const defaultLoc = this.locations.find((l) => l.is_default);
      if (defaultLoc) this.onLocationChange(defaultLoc.id);
    }
    this.loadHistory();
  }

  onLocationChange(locationId: string | null) {
    this.selectedLocationId.set(locationId);
    this.resolvedStockLevelId.set(null);
    this.errorMessage.set(null);
    if (!locationId) return;
    this.resolving.set(true);
    this.api.resolveStockLevelId(this.row.variant_id, locationId).subscribe({
      next: (id) => {
        this.resolving.set(false);
        this.resolvedStockLevelId.set(id);
        if (!id) this.errorMessage.set('This variant is not assigned to the selected warehouse.');
      },
      error: () => {
        this.resolving.set(false);
        this.errorMessage.set('Could not resolve the stock cell for this warehouse.');
      },
    });
  }

  private loadHistory() {
    this.historyLoading.set(true);
    this.api
      .getStockAudits({ variantId: this.row.variant_id, limit: 20, ...this.historyDateBounds() })
      .subscribe({
        next: (page) => {
          this.history.set(page.items);
          this.historyLoading.set(false);
        },
        error: () => this.historyLoading.set(false),
      });
  }

  /** Called on p-datepicker range selection in the history rail. */
  onHistoryDateRangeChange(range: Date[] | null) {
    this.historyDateRange.set(range);
    if (!range || (range[0] && range[1])) {
      this.loadHistory();
    }
  }

  clearHistoryDateRange() {
    this.historyDateRange.set(null);
    this.loadHistory();
  }

  private historyDateBounds(): { createdFrom?: string; createdTo?: string } {
    const range = this.historyDateRange();
    const from = range?.[0] ?? null;
    const to = range?.[1] ?? null;
    if (!from || !to) return {};
    const startOfDay = new Date(from);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);
    return { createdFrom: startOfDay.toISOString(), createdTo: endOfDay.toISOString() };
  }

  get canSave(): boolean {
    if (!this.resolvedStockLevelId() || this.saving()) return false;
    return this.adjustType() === 'quantity' ? this.physicalCount() !== null : this.valueDelta() !== null;
  }

  close() {
    this.visibleChange.emit(false);
  }

  save() {
    const stockLevelId = this.resolvedStockLevelId();
    if (!stockLevelId || !this.canSave) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.api
      .createStockAudit({
        stock_level_id: stockLevelId,
        adjust_type: this.adjustType(),
        physical_count: this.adjustType() === 'quantity' ? this.physicalCount()! : undefined,
        value_delta_minor: this.adjustType() === 'value' ? Math.round(this.valueDelta()! * 100) : undefined,
        reason: this.reason(),
        note: this.note().trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.auditSaved.emit();
          this.close();
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('Failed to save the stock audit. Please try again.');
        },
      });
  }
}

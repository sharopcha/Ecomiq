import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InventoryApiService } from '../data/inventory-api.service';
import { SuppliersMockService } from '../data/suppliers.mock-service';
import { InventoryLocation, ReorderMethod, StockLevelListItem, Supplier } from '../data/inventory-models';

/**
 * "Set Automatic Reorder" modal (screenshot 17.54.51) — Stock Trigger Level,
 * Reorder Quantity, Preferred Supplier, Lead Time.
 *
 * Supplier options come from the MOCK supplier directory (no Supplier backend
 * exists — handover §5). The selected id is stored as the opaque
 * `preferredSupplierId` string inventory-service carries for a future
 * purchasing-service.
 */
@Component({
  selector: 'app-set-reorder-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, SelectModule, InputNumberModule],
  templateUrl: './set-reorder-dialog.component.html',
})
export class SetReorderDialogComponent implements OnInit {
  private readonly api = inject(InventoryApiService);
  private readonly suppliersMock = inject(SuppliersMockService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input({ required: true }) row!: StockLevelListItem;
  @Input() locations: InventoryLocation[] = [];
  @Output() ruleSaved = new EventEmitter<void>();

  readonly triggerLevel = signal<number | null>(null);
  readonly reorderQty = signal<number | null>(null);
  readonly method = signal<ReorderMethod>('purchase_order');
  readonly preferredSupplierId = signal<string | null>(null);
  readonly leadTimeDays = signal<number | null>(null);
  /** null = rule applies across every warehouse */
  readonly locationId = signal<string | null>(null);

  readonly suppliers = signal<Supplier[]>([]);
  readonly saving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly methodOptions: { label: string; value: ReorderMethod }[] = [
    { label: 'Purchase Order', value: 'purchase_order' },
    { label: 'Manual', value: 'manual' },
    { label: 'Dropship', value: 'dropship' },
  ];

  get supplierOptions() {
    return [
      { label: 'No preferred supplier', value: null as string | null },
      ...this.suppliers().map((s) => ({ label: s.name, value: s.id as string | null })),
    ];
  }

  get locationOptions() {
    return [
      { label: 'Every warehouse', value: null as string | null },
      ...this.locations.map((l) => ({ label: l.name, value: l.id as string | null })),
    ];
  }

  ngOnInit() {
    this.suppliersMock.getSuppliers().subscribe((s) => this.suppliers.set(s));
  }

  get canSave(): boolean {
    return this.triggerLevel() !== null && (this.reorderQty() ?? 0) >= 1 && !this.saving();
  }

  close() {
    this.visibleChange.emit(false);
  }

  save() {
    if (!this.canSave) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.api
      .createReorderRule({
        variant_id: this.row.variant_id,
        trigger_level: this.triggerLevel()!,
        reorder_qty: this.reorderQty()!,
        method: this.method(),
        preferred_supplier_id: this.preferredSupplierId(),
        lead_time_days: this.leadTimeDays(),
        location_id: this.locationId(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.ruleSaved.emit();
          this.close();
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('Failed to save the reorder rule. Please try again.');
        },
      });
  }
}

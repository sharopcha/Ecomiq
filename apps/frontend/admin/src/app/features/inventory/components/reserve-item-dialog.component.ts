import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { InventoryApiService } from '../data/inventory-api.service';
import { InventoryLocation, Reservation, StockLevelListItem } from '../data/inventory-models';

/**
 * "Reserve Item … secure it for 24 hours". No dedicated screenshot exists —
 * field set from handover §4: stockLevelId + qty (min 1), optional orderId /
 * orderLineId. Reservations auto-expire 24h after creation (backend-side);
 * creating one 409s when not enough is available.
 *
 * Needs a concrete stock_level.id — same warehouse-resolution flow as the
 * Audit Stock dialog. Also shows active reservations for the variant with a
 * Release action (the only allowed transition).
 */
@Component({
  selector: 'app-reserve-item-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, SelectModule, InputTextModule, InputNumberModule],
  templateUrl: './reserve-item-dialog.component.html',
})
export class ReserveItemDialogComponent implements OnInit {
  private readonly api = inject(InventoryApiService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input({ required: true }) row!: StockLevelListItem;
  @Input() locations: InventoryLocation[] = [];
  @Input() preselectedLocationId: string | null = null;
  @Output() reservationSaved = new EventEmitter<void>();

  readonly qty = signal<number | null>(null);
  readonly orderId = signal<string>('');
  readonly orderLineId = signal<string>('');

  readonly selectedLocationId = signal<string | null>(null);
  readonly resolvedStockLevelId = signal<string | null>(null);
  readonly resolving = signal<boolean>(false);

  readonly reservations = signal<Reservation[]>([]);
  readonly reservationsLoading = signal<boolean>(false);
  readonly releasingId = signal<string | null>(null);

  readonly saving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  get locationOptions() {
    return this.locations.map((l) => ({ label: l.name, value: l.id }));
  }

  ngOnInit() {
    if (this.row.id) {
      this.resolvedStockLevelId.set(this.row.id);
    } else if (this.preselectedLocationId) {
      this.onLocationChange(this.preselectedLocationId);
    } else {
      const defaultLoc = this.locations.find((l) => l.is_default);
      if (defaultLoc) this.onLocationChange(defaultLoc.id);
    }
    this.loadReservations();
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

  private loadReservations() {
    this.reservationsLoading.set(true);
    this.api.getReservations({ variantId: this.row.variant_id, limit: 20 }).subscribe({
      next: (page) => {
        this.reservations.set(page.items);
        this.reservationsLoading.set(false);
      },
      error: () => this.reservationsLoading.set(false),
    });
  }

  release(reservation: Reservation) {
    this.releasingId.set(reservation.id);
    this.api.releaseReservation(reservation.id).subscribe({
      next: () => {
        this.releasingId.set(null);
        this.loadReservations();
        this.reservationSaved.emit();
      },
      error: () => {
        this.releasingId.set(null);
        this.errorMessage.set('Failed to release the reservation.');
      },
    });
  }

  isActive(r: Reservation): boolean {
    return r.released_at === null && new Date(r.reserved_until).getTime() > Date.now();
  }

  get canSave(): boolean {
    return !!this.resolvedStockLevelId() && (this.qty() ?? 0) >= 1 && !this.saving();
  }

  close() {
    this.visibleChange.emit(false);
  }

  save() {
    if (!this.canSave) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.api
      .createReservation({
        stock_level_id: this.resolvedStockLevelId()!,
        qty: this.qty()!,
        order_id: this.orderId().trim() || undefined,
        order_line_id: this.orderLineId().trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.reservationSaved.emit();
          this.close();
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(
            err?.status === 409
              ? 'Not enough available stock to reserve that quantity.'
              : 'Failed to create the reservation. Please try again.',
          );
        },
      });
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InventoryApiService } from '../data/inventory-api.service';
import { InventoryLocation } from '../data/inventory-models';

/**
 * Warehouses (Locations) — settings-style CRUD list. No screenshot exists for
 * this screen (handover §4); it backs the warehouse filter on the Inventory
 * list and the per-warehouse rows on the product detail Stock section.
 * First location created for a store becomes default automatically.
 */
@Component({
  selector: 'app-locations-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, DialogModule, InputTextModule],
  templateUrl: './locations-list.component.html',
})
export class LocationsListComponent implements OnInit {
  private readonly api = inject(InventoryApiService);

  readonly locations = signal<InventoryLocation[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);

  // Create / edit dialog
  readonly showEditDialog = signal<boolean>(false);
  readonly editing = signal<InventoryLocation | null>(null);
  readonly saving = signal<boolean>(false);
  readonly dialogError = signal<string | null>(null);

  // Form fields (plain fields — small form, one dialog at a time)
  name = '';
  addressLine1 = '';
  addressLine2 = '';
  city = '';
  region = '';
  postalCode = '';
  countryCode = '';
  isActive = true;
  isDefault = false;

  ngOnInit() {
    this.fetch();
  }

  fetch() {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.getLocations(null, 100).subscribe({
      next: (page) => {
        this.locations.set(page.items);
        this.nextCursor.set(page.next_cursor);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Failed to load warehouses. Please try again.');
      },
    });
  }

  openCreate() {
    this.editing.set(null);
    this.name = '';
    this.addressLine1 = '';
    this.addressLine2 = '';
    this.city = '';
    this.region = '';
    this.postalCode = '';
    this.countryCode = '';
    this.isActive = true;
    this.isDefault = false;
    this.dialogError.set(null);
    this.showEditDialog.set(true);
  }

  openEdit(location: InventoryLocation) {
    this.editing.set(location);
    this.name = location.name;
    this.addressLine1 = location.address_line1 ?? '';
    this.addressLine2 = location.address_line2 ?? '';
    this.city = location.city ?? '';
    this.region = location.region ?? '';
    this.postalCode = location.postal_code ?? '';
    this.countryCode = location.country_code ?? '';
    this.isActive = location.is_active;
    this.isDefault = location.is_default;
    this.dialogError.set(null);
    this.showEditDialog.set(true);
  }

  save() {
    if (!this.name.trim() || this.saving()) return;
    this.saving.set(true);
    this.dialogError.set(null);
    const payload = {
      name: this.name.trim(),
      address_line1: this.addressLine1.trim() || undefined,
      address_line2: this.addressLine2.trim() || undefined,
      city: this.city.trim() || undefined,
      region: this.region.trim() || undefined,
      postal_code: this.postalCode.trim() || undefined,
      country_code: this.countryCode.trim() || undefined,
      is_active: this.isActive,
      is_default: this.isDefault,
    };
    const editing = this.editing();
    const request$ = editing ? this.api.updateLocation(editing.id, payload) : this.api.createLocation(payload);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.showEditDialog.set(false);
        this.fetch();
      },
      error: () => {
        this.saving.set(false);
        this.dialogError.set('Failed to save the warehouse. Please try again.');
      },
    });
  }

  formatAddress(location: InventoryLocation): string {
    return [location.address_line1, location.city, location.region, location.country_code]
      .filter((part): part is string => !!part)
      .join(' · ');
  }

  delete(location: InventoryLocation) {
    if (!confirm(`Delete warehouse "${location.name}"? This fails if it still holds stock.`)) return;
    this.api.deleteLocation(location.id).subscribe({
      next: () => this.fetch(),
      error: () => this.loadError.set('Could not delete the warehouse — it may still hold stock.'),
    });
  }
}

import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InventoryApiService } from '../data/inventory-api.service';
import {
  InventoryLocation,
  StockAlertAction,
  StockAlertDirection,
  StockLevelListItem,
} from '../data/inventory-models';

/**
 * "Create Stock Alert" row action. No dedicated screenshot exists — layout
 * follows Catalog's `configure-alert-dialog` structure with the field set
 * from handover §4 (threshold, direction, actions, optional warehouse scope).
 */
@Component({
  selector: 'app-create-stock-alert-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, SelectModule, InputNumberModule],
  templateUrl: './create-stock-alert-dialog.component.html',
})
export class CreateStockAlertDialogComponent {
  private readonly api = inject(InventoryApiService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input({ required: true }) row!: StockLevelListItem;
  @Input() locations: InventoryLocation[] = [];
  @Output() alertSaved = new EventEmitter<void>();

  readonly threshold = signal<number | null>(null);
  readonly direction = signal<StockAlertDirection>('lower_than');
  readonly selectedActions = signal<StockAlertAction[]>(['send_email']);
  /** null = watch across every warehouse */
  readonly locationId = signal<string | null>(null);

  readonly saving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly directionOptions: { label: string; value: StockAlertDirection }[] = [
    { label: 'Lower Than', value: 'lower_than' },
    { label: 'Greater Than', value: 'greater_than' },
    { label: 'Equals', value: 'equals' },
  ];

  readonly actionOptions: { label: string; value: StockAlertAction; icon: string }[] = [
    { label: 'Send Email', value: 'send_email', icon: 'pi pi-envelope' },
    { label: 'Send Inbox Notification', value: 'send_inbox', icon: 'pi pi-inbox' },
    { label: 'Send SMS', value: 'send_sms', icon: 'pi pi-mobile' },
    { label: 'Create Task', value: 'create_task', icon: 'pi pi-check-square' },
  ];

  get locationOptions() {
    return [
      { label: 'Every warehouse', value: null as string | null },
      ...this.locations.map((l) => ({ label: l.name, value: l.id as string | null })),
    ];
  }

  toggleAction(action: StockAlertAction) {
    this.selectedActions.update((actions) =>
      actions.includes(action) ? actions.filter((a) => a !== action) : [...actions, action],
    );
  }

  get canSave(): boolean {
    return this.threshold() !== null && this.selectedActions().length > 0 && !this.saving();
  }

  close() {
    this.visibleChange.emit(false);
  }

  save() {
    if (!this.canSave) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.api
      .createStockAlert({
        variant_id: this.row.variant_id,
        threshold: this.threshold()!,
        direction: this.direction(),
        actions: this.selectedActions(),
        location_id: this.locationId(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.alertSaved.emit();
          this.close();
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('Failed to create the stock alert. Please try again.');
        },
      });
  }
}

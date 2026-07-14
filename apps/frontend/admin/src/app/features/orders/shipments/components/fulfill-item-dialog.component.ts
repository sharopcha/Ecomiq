import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { ShipmentsApiService } from '../data/shipments-api.service';

@Component({
  selector: 'app-fulfill-item-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    CheckboxModule
  ],
  templateUrl: './fulfill-item-dialog.component.html',
  styles: []
})
export class FulfillItemDialogComponent {
  private readonly api = inject(ShipmentsApiService);

  @Input() visible = false;
  @Input() orderId = '';
  // Input items: normally would come from the order data
  @Input() items: { id: string, name: string, maxQty: number, qtyToFulfill: number, sku: string }[] = [];
  
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() fulfilled = new EventEmitter<void>();

  notifyCustomer = signal(true);
  trackingNumbers = signal<string[]>(['']);
  submitting = signal(false);

  hide() {
    this.visibleChange.emit(false);
  }

  addTracking() {
    this.trackingNumbers.update(nums => [...nums, '']);
  }

  removeTracking(index: number) {
    this.trackingNumbers.update(nums => {
      const copy = [...nums];
      copy.splice(index, 1);
      return copy;
    });
  }

  updateTracking(index: number, val: string) {
    this.trackingNumbers.update(nums => {
      const copy = [...nums];
      copy[index] = val;
      return copy;
    });
  }

  confirm() {
    this.submitting.set(true);

    const payload = {
      orderId: this.orderId,
      notifyCustomer: this.notifyCustomer(),
      lines: this.items
        .filter(i => i.qtyToFulfill > 0)
        .map(i => ({ orderLineId: i.id, qty: i.qtyToFulfill })),
      trackingNumbers: this.trackingNumbers().filter(t => t.trim().length > 0)
    };

    if (payload.lines.length === 0) {
      this.submitting.set(false);
      return;
    }

    this.api.fulfillItem(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.fulfilled.emit();
      },
      error: () => {
        this.submitting.set(false);
      }
    });
  }
}

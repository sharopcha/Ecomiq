import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { Shipment } from '../data/shipments.models';
import { ShipmentsApiService } from '../data/shipments-api.service';

@Component({
  selector: 'app-schedule-pickup-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    SelectModule,
    DatePickerModule,
    TextareaModule
  ],
  templateUrl: './schedule-pickup-dialog.component.html',
  styles: []
})
export class SchedulePickupDialogComponent {
  private readonly api = inject(ShipmentsApiService);

  @Input() visible = false;
  @Input() shipments: Shipment[] = [];
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() scheduled = new EventEmitter<void>();

  step = signal<1 | 2>(1);
  submitting = signal(false);

  // Form state
  carrier = signal('FedEx');
  pickupDate = signal<Date | null>(null);
  pickupTime = signal<Date | null>(null);
  note = signal('');

  carrierOptions = [
    { label: 'FedEx Express', value: 'FedEx' },
    { label: 'UPS Ground', value: 'UPS' },
    { label: 'USPS Priority', value: 'USPS' },
    { label: 'DHL Express', value: 'DHL' }
  ];

  get canGoNext(): boolean {
    return !!this.carrier() && !!this.pickupDate() && !!this.pickupTime();
  }

  hide() {
    this.visibleChange.emit(false);
  }

  next() {
    this.step.set(2);
  }

  back() {
    this.step.set(1);
  }

  confirm() {
    this.submitting.set(true);
    const date = this.pickupDate();
    const time = this.pickupTime();

    if (!date || !time) return;

    const payload = {
      shipmentIds: this.shipments.map(s => s.id),
      carrier: this.carrier(),
      pickupDate: date.toISOString().split('T')[0],
      pickupTime: time.toTimeString().split(' ')[0], // Extracts HH:MM:SS
      note: this.note()
    };

    this.api.schedulePickupsBulk(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.scheduled.emit();
      },
      error: () => {
        this.submitting.set(false);
      }
    });
  }
}

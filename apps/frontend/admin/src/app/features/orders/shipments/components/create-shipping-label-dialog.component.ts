import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { ShipmentsApiService } from '../data/shipments-api.service';
import { PackagePreset } from '../data/shipments.models';

@Component({
  selector: 'app-create-shipping-label-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    SelectModule,
    DatePickerModule,
    InputNumberModule,
    CheckboxModule
  ],
  templateUrl: './create-shipping-label-dialog.component.html',
  styles: []
})
export class CreateShippingLabelDialogComponent implements OnInit {
  private readonly api = inject(ShipmentsApiService);

  @Input() visible = false;
  @Input() orderId = '';
  // The items that need packaging
  @Input() items: any[] = [];
  
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() labelCreated = new EventEmitter<void>();

  step = signal<1 | 2 | 3>(1);
  submitting = signal(false);
  presets = signal<PackagePreset[]>([]);

  // Step 1
  carrier = signal('USPS');
  serviceType = signal('Priority Mail');
  shipDate = signal<Date>(new Date());
  notifyCustomer = signal(true);

  // Step 2
  packages = signal<any[]>([]);

  carrierOptions = [
    { label: 'USPS', value: 'USPS' },
    { label: 'FedEx', value: 'FedEx' },
    { label: 'UPS', value: 'UPS' }
  ];

  serviceOptions = [
    { label: 'Priority Mail', value: 'Priority Mail' },
    { label: 'Priority Mail Express', value: 'Priority Mail Express' },
    { label: 'First-Class Mail', value: 'First-Class Mail' }
  ];

  ngOnInit() {
    this.api.getPackagePresets().subscribe(res => {
      this.presets.set(res.items);
    });

    // Initialize 1 default package
    this.packages.set([{
      type: 'custom',
      presetId: null,
      length: null,
      width: null,
      height: null,
      weight: null,
      items: [...this.items]
    }]);
  }

  hide() {
    this.visibleChange.emit(false);
  }

  next() {
    if (this.step() < 3) this.step.set((this.step() + 1) as 1 | 2 | 3);
  }

  back() {
    if (this.step() > 1) this.step.set((this.step() - 1) as 1 | 2 | 3);
  }

  addPackage() {
    this.packages.update(pkgs => [
      ...pkgs,
      {
        type: 'custom',
        presetId: null,
        length: null,
        width: null,
        height: null,
        weight: null,
        items: []
      }
    ]);
  }

  removePackage(index: number) {
    this.packages.update(pkgs => {
      const copy = [...pkgs];
      copy.splice(index, 1);
      return copy;
    });
  }

  onPresetChange(pkg: any) {
    if (pkg.presetId) {
      const preset = this.presets().find(p => p.id === pkg.presetId);
      if (preset) {
        pkg.length = preset.length_cm;
        pkg.width = preset.width_cm;
        pkg.height = preset.height_cm;
      }
    }
  }

  confirm() {
    this.submitting.set(true);
    // Real flow: create draft -> purchase. We will just combine for UI simplicity.
    const payload = {
      orderId: this.orderId,
      carrier: this.carrier(),
      serviceType: this.serviceType(),
      shipDate: this.shipDate().toISOString().split('T')[0],
      notifyCustomer: this.notifyCustomer(),
      packages: this.packages().map(p => ({
        packagePresetId: p.presetId,
        packageType: p.type,
        totalWeightKg: p.weight,
        lengthCm: p.length,
        widthCm: p.width,
        heightCm: p.height
      }))
    };

    this.api.createLabel(payload).subscribe({
      next: (label) => {
        // Automatically purchase in this simplified flow
        this.api.purchaseLabel(label.id).subscribe({
          next: () => {
            this.submitting.set(false);
            this.labelCreated.emit();
          },
          error: () => this.submitting.set(false)
        });
      },
      error: () => this.submitting.set(false)
    });
  }
}

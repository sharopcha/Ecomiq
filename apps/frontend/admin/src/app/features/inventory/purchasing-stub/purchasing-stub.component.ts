import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Purchasing — stub. The "Purchasing" sidebar item (screenshot 17.55.22) has
 * no backend at all (handover §5); same caveat as Supplier. Mirrors the
 * `*-stub` pattern in the products feature.
 */
@Component({
  selector: 'app-purchasing-stub',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './purchasing-stub.component.html',
})
export class PurchasingStubComponent {}

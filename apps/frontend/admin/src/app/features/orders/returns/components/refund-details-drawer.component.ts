import { Component, Input, Output, EventEmitter, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { RouterModule } from '@angular/router';

import { ReturnsApiService } from '../data/returns-api.service';
import { Refund, RefundType, RefundStatus } from '../data/returns.models';

@Component({
  selector: 'app-refund-details-drawer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DrawerModule,
    ButtonModule,
    TagModule,
    TextareaModule,
    CheckboxModule,
    DialogModule
  ],
  templateUrl: './refund-details-drawer.component.html',
  styles: []
})
export class RefundDetailsDrawerComponent {
  private readonly api = inject(ReturnsApiService);

  @Input() visible = false;
  @Input() refundId = '';
  @Output() visibleChange = new EventEmitter<boolean>();

  readonly loading = signal(false);
  readonly refund = signal<Refund | null>(null);

  readonly showDeclineModal = signal(false);
  readonly declineReason = signal('');

  constructor() {
    effect(() => {
      const id = this.refundId;
      const isVisible = this.visible;
      if (isVisible && id) {
        this.loadDetails(id);
      }
    });
  }

  loadDetails(id: string) {
    this.loading.set(true);
    this.api.getRefundById(id).subscribe(res => {
      this.refund.set(res);
      this.loading.set(false);
    });
  }

  close() {
    this.visibleChange.emit(false);
  }

  approve() {
    const id = this.refund()?.id;
    if (id) {
      this.api.approveRefund(id).subscribe(res => {
        this.refund.set(res);
      });
    }
  }

  decline() {
    const id = this.refund()?.id;
    if (id) {
      this.api.declineRefund(id, this.declineReason()).subscribe(res => {
        this.refund.set(res);
        this.showDeclineModal.set(false);
        this.declineReason.set('');
      });
    }
  }

  getStatusClass(status: string | undefined): string {
    if (!status) return '';
    const base = 'text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded border ';
    switch (status) {
      case 'refunded': return base + 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'processing': return base + 'text-blue-600 bg-blue-50 border-blue-200';
      case 'requested': return base + 'text-amber-600 bg-amber-50 border-amber-200';
      case 'declined': return base + 'text-red-600 bg-red-50 border-red-200';
      case 'not_refunded': return base + 'text-slate-600 bg-slate-50 border-slate-200';
      default: return base + 'text-slate-600 bg-slate-50 border-slate-200';
    }
  }

  formatStatus(status: string | undefined): string {
    if (!status) return '';
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

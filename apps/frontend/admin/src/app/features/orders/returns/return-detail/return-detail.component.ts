import { Component, Input, Output, EventEmitter, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { DialogModule } from 'primeng/dialog';
import { RouterModule } from '@angular/router';

import { ReturnsApiService } from '../data/returns-api.service';
import { ReturnRequest, ReturnProof, OrderComment, ReturnStatus, RefundType } from '../data/returns.models';
import { ApproveReturnModalComponent } from '../components/approve-return-modal.component';
import { RefundDetailsDrawerComponent } from '../components/refund-details-drawer.component';

@Component({
  selector: 'app-return-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DrawerModule,
    ButtonModule,
    TagModule,
    TextareaModule,
    DialogModule,
    ApproveReturnModalComponent,
    RefundDetailsDrawerComponent
  ],
  templateUrl: './return-detail.component.html',
  styles: []
})
export class ReturnDetailComponent {
  private readonly api = inject(ReturnsApiService);

  @Input() visible = false;
  @Input() returnId = '';
  @Output() visibleChange = new EventEmitter<boolean>();

  readonly loading = signal(false);
  readonly returnReq = signal<ReturnRequest | null>(null);
  readonly proofs = signal<ReturnProof[]>([]);
  readonly comments = signal<OrderComment[]>([]);
  
  readonly showComments = signal(true);
  readonly newComment = signal('');

  // Modals
  readonly showRejectModal = signal(false);
  readonly rejectReason = signal('');

  readonly showApproveModal = signal(false);
  
  readonly showResolveModal = signal(false);
  readonly selectedRefundType = signal<RefundType>('full');

  readonly showRefundDrawer = signal(false);
  readonly activeRefundId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.returnId;
      const isVisible = this.visible;
      if (isVisible && id) {
        this.loadDetails(id);
      }
    });
  }

  loadDetails(id: string) {
    this.loading.set(true);
    this.api.getReturnById(id).subscribe(req => {
      this.returnReq.set(req);
      this.loading.set(false);
    });

    this.api.getReturnProofs(id).subscribe(p => this.proofs.set(p));
    this.api.getReturnComments(id).subscribe(c => this.comments.set(c));
  }

  close() {
    this.visibleChange.emit(false);
  }

  approve(emailData?: any) {
    const id = this.returnReq()?.id;
    if (id) {
      this.api.approveReturn(id).subscribe(res => {
        this.returnReq.set(res);
        this.showApproveModal.set(false);
        // We would also send the email via a notification service here
      });
    }
  }

  viewRefund(refundId: string) {
    this.activeRefundId.set(refundId);
    this.showRefundDrawer.set(true);
  }

  reject() {
    const id = this.returnReq()?.id;
    if (id) {
      this.api.rejectReturn(id, this.rejectReason()).subscribe(res => {
        this.returnReq.set(res);
        this.showRejectModal.set(false);
        this.rejectReason.set('');
      });
    }
  }

  inspect() {
    const id = this.returnReq()?.id;
    if (id) {
      this.api.inspectReturn(id).subscribe(res => {
        this.returnReq.set(res);
      });
    }
  }

  resolve() {
    const id = this.returnReq()?.id;
    if (id) {
      this.api.resolveReturn(id, this.selectedRefundType()).subscribe(res => {
        this.returnReq.set(res);
        this.showResolveModal.set(false);
      });
    }
  }

  addComment() {
    const id = this.returnReq()?.id;
    const content = this.newComment().trim();
    if (id && content) {
      this.api.addReturnComment(id, content).subscribe(res => {
        this.comments.set([...this.comments(), res]);
        this.newComment.set('');
      });
    }
  }

  getStatusClass(status: string | undefined): string {
    if (!status) return '';
    const base = 'text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded border ';
    switch (status) {
      case 'approved': return base + 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'resolved': return base + 'text-blue-600 bg-blue-50 border-blue-200';
      case 'pending_approval': return base + 'text-amber-600 bg-amber-50 border-amber-200';
      case 'rejected': return base + 'text-red-600 bg-red-50 border-red-200';
      default: return base + 'text-slate-600 bg-slate-50 border-slate-200';
    }
  }

  formatStatus(status: string | undefined): string {
    if (!status) return '';
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

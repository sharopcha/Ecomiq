import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { OrdersApiService } from '../data/orders-api.service';
import { Order, OrderComment, OrderPaymentStatus, FulfillmentStatus, OrderTag } from '../data/orders.models';
import { map, switchMap, tap } from 'rxjs';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ButtonModule, TabsModule, TableModule, TagModule],
  templateUrl: './order-detail.component.html',
  styles: [],
})
export class OrderDetailComponent implements OnInit {
  private readonly api = inject(OrdersApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly order = signal<Order | null>(null);
  readonly customer = signal<any | null>(null);
  readonly comments = signal<OrderComment[]>([]);
  
  readonly activeTab = signal('details');
  readonly newComment = signal('');
  readonly newTag = signal('');

  readonly itemsCount = computed(() => {
    return this.order()?.lines?.reduce((sum, line) => sum + line.qty, 0) || 0;
  });

  ngOnInit() {
    this.route.paramMap.pipe(
      map(params => params.get('id')),
      switchMap(id => {
        if (!id) throw new Error('No id provided');
        return this.api.getOrderById(id);
      })
    ).subscribe({
      next: (order) => {
        if (order) {
          this.order.set(order);
          this.loadCustomer(order.customer_id);
          this.loadComments(order.id);
        } else {
          this.router.navigate(['/orders']);
        }
      },
      error: () => this.router.navigate(['/orders'])
    });
  }

  loadCustomer(customerId?: string) {
    if (!customerId) return;
    this.api.getCustomer(customerId).subscribe(c => this.customer.set(c));
  }

  loadComments(orderId: string) {
    this.api.getComments(orderId).subscribe(c => this.comments.set(c));
  }

  addComment() {
    const o = this.order();
    const c = this.newComment().trim();
    if (!o || !c) return;

    this.api.addComment(o.id, c).subscribe(() => {
      this.newComment.set('');
      this.loadComments(o.id);
    });
  }

  addTag() {
    const o = this.order();
    const t = this.newTag().trim();
    if (!o || !t) return;

    // Use a mock tagId generation for this stub since the real backend expects an existing tagId
    // But we are in admin so we may just pass the text. The DTO says `tagId: string`.
    this.api.addTag(o.id, t).subscribe(updated => {
      this.newTag.set('');
      this.order.set(updated);
    });
  }

  removeTag(tagId: string) {
    const o = this.order();
    if (!o) return;
    this.api.removeTag(o.id, tagId).subscribe(updated => {
      this.order.set(updated);
    });
  }

  confirmOrder() {
    const o = this.order();
    if (!o) return;
    this.api.confirmOrder(o.id).subscribe(updated => this.order.set(updated));
  }

  cancelOrder() {
    const o = this.order();
    if (!o) return;
    const reason = prompt('Cancellation reason:');
    if (reason !== null) {
      this.api.cancelOrder(o.id, reason).subscribe(updated => this.order.set(updated));
    }
  }

  advanceStage() {
    const o = this.order();
    if (!o) return;
    this.api.advanceStage(o.id).subscribe(updated => this.order.set(updated));
  }

  getPaymentStatusClass(status?: OrderPaymentStatus): string {
    if (!status) return '';
    const base = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border inline-block ';
    switch (status) {
      case 'paid': return base + 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'pending': return base + 'text-amber-600 bg-amber-50 border-amber-200';
      case 'failed':
      case 'canceled': return base + 'text-red-600 bg-red-50 border-red-200';
      case 'refunded':
      case 'partially_refunded': return base + 'text-blue-600 bg-blue-50 border-blue-200';
      default: return base + 'text-slate-600 bg-slate-50 border-slate-200';
    }
  }

  getFulfillmentStatusClass(status?: FulfillmentStatus): string {
    if (!status) return '';
    const base = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border inline-block ';
    switch (status) {
      case 'fulfilled': return base + 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'partially_fulfilled': return base + 'text-blue-600 bg-blue-50 border-blue-200';
      case 'unfulfilled': return base + 'text-amber-600 bg-amber-50 border-amber-200';
      case 'canceled': return base + 'text-red-600 bg-red-50 border-red-200';
      default: return base + 'text-slate-600 bg-slate-50 border-slate-200';
    }
  }
}

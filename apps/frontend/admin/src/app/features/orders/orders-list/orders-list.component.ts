import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { OrdersApiService } from '../data/orders-api.service';
import { Order, OrderPaymentStatus, FulfillmentStatus } from '../data/orders.models';

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TableModule, SelectModule],
  templateUrl: './orders-list.component.html',
  styles: [],
})
export class OrdersListComponent implements OnInit {
  private readonly api = inject(OrdersApiService);

  readonly orders = signal<Order[]>([]);
  readonly activeTab = signal<string>('All orders');
  readonly searchQuery = signal<string>('');
  
  // Filter dropdown states
  readonly selectedPaymentStatus = signal<string | null>(null);
  readonly selectedFulfillmentStatus = signal<string | null>(null);

  readonly paymentStatusOptions = signal([
    { label: 'All Payments', value: null },
    { label: 'Paid', value: 'paid' },
    { label: 'Pending', value: 'pending' },
    { label: 'Failed', value: 'failed' },
    { label: 'Canceled', value: 'canceled' },
    { label: 'Refunded', value: 'refunded' },
  ]);

  readonly fulfillmentStatusOptions = signal([
    { label: 'All Fulfillments', value: null },
    { label: 'Fulfilled', value: 'fulfilled' },
    { label: 'Unfulfilled', value: 'unfulfilled' },
    { label: 'Partially Fulfilled', value: 'partially_fulfilled' },
    { label: 'Canceled', value: 'canceled' },
  ]);

  // Cache for customer names fetched from CRM mock
  readonly customerNames = signal<Record<string, string>>({});

  readonly filteredOrders = computed(() => {
    let list = this.orders();
    
    // Tab Filter
    const tab = this.activeTab();
    if (tab === 'Unfulfilled') {
      list = list.filter(o => o.fulfillment_status === 'unfulfilled');
    } else if (tab === 'Paid') {
      list = list.filter(o => o.payment_status === 'paid');
    }

    // Dropdown Filters
    const payStatus = this.selectedPaymentStatus();
    if (payStatus) {
      list = list.filter(o => o.payment_status === payStatus);
    }

    const fulStatus = this.selectedFulfillmentStatus();
    if (fulStatus) {
      list = list.filter(o => o.fulfillment_status === fulStatus);
    }

    // Search Query Filter (by display_number)
    const search = this.searchQuery().trim();
    if (search) {
      list = list.filter(o => o.display_number.toString().includes(search));
    }

    return list;
  });

  ngOnInit() {
    this.loadOrders();
  }

  loadOrders() {
    this.api.getOrders().subscribe((res) => {
      this.orders.set(res.items);
      this.fetchCustomerNames(res.items);
    });
  }

  fetchCustomerNames(orders: Order[]) {
    const ids = Array.from(new Set(orders.map(o => o.customer_id).filter(id => !!id)));
    ids.forEach(id => {
      if (!this.customerNames()[id!]) {
        this.api.getCustomer(id!).subscribe(c => {
          this.customerNames.update(map => ({...map, [id!]: c.name}));
        });
      }
    });
  }

  setTab(tab: string) {
    this.activeTab.set(tab);
  }

  getCustomerName(id?: string): string {
    if (!id) return 'Guest';
    return this.customerNames()[id] || 'Loading...';
  }

  formatChannel(channel: string): string {
    return channel.replace('_', ' ');
  }

  formatCustomerId(customerId?: string): string {
    if (!customerId) return 'CST-124';
    const match = customerId.match(/\d+/);
    if (match) {
      return `CST-${match[0]}`;
    }
    let hash = 0;
    for (let i = 0; i < customerId.length; i++) {
      hash = customerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const code = Math.abs(hash % 900) + 100;
    return `CST-${code}`;
  }

  countItems(order: Order): number {
    return order.lines?.reduce((sum, line) => sum + line.qty, 0) || 0;
  }

  getPaymentStatusClass(status: OrderPaymentStatus): string {
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

  getFulfillmentStatusClass(status: FulfillmentStatus): string {
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

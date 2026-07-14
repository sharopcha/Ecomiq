import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { PopoverModule } from 'primeng/popover';

import { ReturnsApiService } from '../data/returns-api.service';
import { ReturnRequest, ReturnStatus, ReturnShipping } from '../data/returns.models';
import { ReturnDetailComponent } from '../return-detail/return-detail.component';

@Component({
  selector: 'app-returns-list',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    RouterModule,
    ButtonModule,
    InputTextModule,
    TableModule,
    TagModule,
    SelectModule,
    DatePickerModule,
    PopoverModule,
    ReturnDetailComponent
  ],
  templateUrl: './returns-list.component.html',
  styles: []
})
export class ReturnsListComponent implements OnInit {
  private readonly api = inject(ReturnsApiService);

  readonly returns = signal<ReturnRequest[]>([]);
  readonly loading = signal(false);

  // Filtering
  readonly activeTab = signal<'all' | 'pending' | 'approved' | 'rejected'>('all');
  readonly searchQuery = signal('');
  readonly shippingFilter = signal<ReturnShipping | null>(null);
  readonly dateRange = signal<Date[] | null>(null);

  readonly shippingOptions = [
    { label: 'All Shipping', value: null },
    { label: 'None', value: 'none' },
    { label: 'Sending', value: 'sending' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Received', value: 'received' }
  ];

  // Drawers
  readonly showReturnDrawer = signal(false);
  readonly activeReturnId = signal<string | null>(null);

  // Derived state
  readonly filteredReturns = computed(() => {
    let items = this.returns();
    const tab = this.activeTab();
    const query = this.searchQuery().toLowerCase();
    const sf = this.shippingFilter();

    if (tab === 'pending') {
      items = items.filter(r => r.status === 'pending_approval');
    } else if (tab === 'approved') {
      items = items.filter(r => r.status === 'approved' || r.status === 'resolved');
    } else if (tab === 'rejected') {
      items = items.filter(r => r.status === 'rejected');
    }

    if (sf) {
      items = items.filter(r => r.shipping_status === sf);
    }

    if (query) {
      items = items.filter(r => 
        r.display_id.toLowerCase().includes(query) || 
        r.order_id.toLowerCase().includes(query)
      );
    }

    return items;
  });

  ngOnInit() {
    this.loadReturns();
  }

  loadReturns() {
    this.loading.set(true);
    this.api.getReturns({ limit: 50 }).subscribe({
      next: (res) => {
        this.returns.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onTabChange(tab: 'all' | 'pending' | 'approved' | 'rejected') {
    this.activeTab.set(tab);
  }

  openReturn(id: string) {
    this.activeReturnId.set(id);
    this.showReturnDrawer.set(true);
  }

  getStatusClass(status: ReturnStatus): string {
    const base = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ';
    switch (status) {
      case 'approved': return base + 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'resolved': return base + 'text-blue-600 bg-blue-50 border-blue-200';
      case 'pending_approval': return base + 'text-amber-600 bg-amber-50 border-amber-200';
      case 'rejected': return base + 'text-red-600 bg-red-50 border-red-200';
      case 'expired': return base + 'text-slate-600 bg-slate-50 border-slate-200';
      default: return base + 'text-slate-600 bg-slate-50 border-slate-200';
    }
  }

  formatStatus(status: ReturnStatus): string {
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

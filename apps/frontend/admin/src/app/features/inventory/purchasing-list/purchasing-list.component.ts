import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';

import { PurchasingApiService } from '../data/purchasing-api.service';
import { PurchaseOrder } from '../data/purchasing.models';

@Component({
  selector: 'app-purchasing-list',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, TableModule],
  templateUrl: './purchasing-list.component.html'
})
export class PurchasingListComponent implements OnInit {
  private readonly api = inject(PurchasingApiService);
  private readonly router = inject(Router);

  readonly pos = signal<PurchaseOrder[]>([]);
  readonly loading = signal(true);

  ngOnInit() {
    this.api.getPurchaseOrders().subscribe({
      next: (data) => {
        this.pos.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  createPO() {
    this.router.navigate(['/inventory/purchasing/new']);
  }

  statusBadgeClass(status: string): string {
    const base = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border';
    switch (status) {
      case 'received': return `${base} text-emerald-600 bg-emerald-50 border-emerald-200`;
      case 'shipped': return `${base} text-blue-600 bg-blue-50 border-blue-100`;
      case 'approved':
      case 'pending': return `${base} text-amber-600 bg-amber-50 border-amber-200`;
      case 'cancelled': return `${base} text-red-600 bg-red-50 border-red-200`;
      case 'draft':
      default: return `${base} text-slate-500 bg-slate-50 border-slate-200`;
    }
  }
}

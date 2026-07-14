import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { MenuModule } from 'primeng/menu';
import { DatePickerModule } from 'primeng/datepicker';
import { PopoverModule } from 'primeng/popover';
import { MenuItem } from 'primeng/api';

import { ShipmentsApiService } from '../data/shipments-api.service';
import { Shipment, ShipmentStatus } from '../data/shipments.models';
import { SchedulePickupDialogComponent } from '../components/schedule-pickup-dialog.component';
import { NotifyCustomerModalComponent } from '../components/notify-customer-modal.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-shipments-list',
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
    MenuModule,
    DatePickerModule,
    PopoverModule,
    PopoverModule,
    SchedulePickupDialogComponent,
    NotifyCustomerModalComponent
  ],
  templateUrl: './shipments-list.component.html',
  styles: []
})
export class ShipmentsListComponent implements OnInit {
  private readonly api = inject(ShipmentsApiService);

  readonly shipments = signal<Shipment[]>([]);
  readonly loading = signal(false);
  readonly selectedShipments = signal<Shipment[]>([]);
  readonly selectedShipmentForAction = signal<Shipment | null>(null);

  private readonly router = inject(Router);

  // Filtering
  readonly activeTab = signal<'all' | 'pending' | 'arrived'>('all');
  readonly searchQuery = signal('');
  readonly statusFilter = signal<ShipmentStatus | null>(null);
  readonly dateRange = signal<Date[] | null>(null);

  readonly statusOptions = [
    { label: 'All Statuses', value: null },
    { label: 'Draft', value: 'draft' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Arrived', value: 'arrived' },
    { label: 'Canceled', value: 'canceled' },
  ];

  // Dialogs
  readonly showPickupDialog = signal(false);
  readonly showNotifyDialog = signal(false);

  // Derived state
  readonly filteredShipments = computed(() => {
    let items = this.shipments();
    const tab = this.activeTab();
    const query = this.searchQuery().toLowerCase();
    const st = this.statusFilter();

    if (tab === 'pending') {
      items = items.filter(s => s.status === 'draft' || s.status === 'in_progress');
    } else if (tab === 'arrived') {
      items = items.filter(s => s.status === 'arrived');
    }

    if (st) {
      items = items.filter(s => s.status === st);
    }

    if (query) {
      items = items.filter(s => 
        s.display_id.toLowerCase().includes(query) || 
        s.order_id.toLowerCase().includes(query) ||
        (s.carrier || '').toLowerCase().includes(query)
      );
    }

    return items;
  });

  readonly tableMenu: MenuItem[] = [
    { 
      label: 'View Details', 
      icon: 'pi pi-eye', 
      command: () => {
        const s = this.selectedShipmentForAction();
        if (s) this.router.navigate(['/orders/shipments', s.id]);
      } 
    },
    { 
      label: 'Notify Customer', 
      icon: 'pi pi-envelope', 
      command: () => this.showNotifyDialog.set(true)
    },
    { separator: true },
    { 
      label: 'Cancel Shipment', 
      icon: 'pi pi-times', 
      styleClass: 'text-red-600', 
      command: () => {
        const s = this.selectedShipmentForAction();
        if (s) this.api.cancelShipment(s.id).subscribe(() => this.loadShipments());
      }
    }
  ];

  onMenuClick(event: Event, menu: any, shipment: Shipment) {
    this.selectedShipmentForAction.set(shipment);
    menu.toggle(event);
  }

  ngOnInit() {
    this.loadShipments();
  }

  loadShipments() {
    this.loading.set(true);
    // Ideally we pass params to server for real pagination/filtering
    this.api.getShipments({ limit: 50 }).subscribe({
      next: (res) => {
        this.shipments.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onTabChange(tab: 'all' | 'pending' | 'arrived') {
    this.activeTab.set(tab);
    this.selectedShipments.set([]);
  }

  openSchedulePickup() {
    if (this.selectedShipments().length === 0) return;
    this.showPickupDialog.set(true);
  }

  onPickupScheduled() {
    this.showPickupDialog.set(false);
    this.selectedShipments.set([]);
    this.loadShipments();
  }

  getStatusClass(status: ShipmentStatus): string {
    const base = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ';
    switch (status) {
      case 'arrived': return base + 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'in_progress': return base + 'text-blue-600 bg-blue-50 border-blue-200';
      case 'draft': return base + 'text-amber-600 bg-amber-50 border-amber-200';
      case 'canceled': return base + 'text-red-600 bg-red-50 border-red-200';
      default: return base + 'text-slate-600 bg-slate-50 border-slate-200';
    }
  }

  getCarrierLogo(carrier?: string): string {
    const c = (carrier || '').toLowerCase();
    if (c.includes('fedex')) return 'https://upload.wikimedia.org/wikipedia/commons/9/9d/FedEx_Express.svg';
    if (c.includes('ups')) return 'https://upload.wikimedia.org/wikipedia/commons/1/1b/UPS_Logo_shield_2014.svg';
    if (c.includes('dhl')) return 'https://upload.wikimedia.org/wikipedia/commons/a/ac/DHL_Logo.svg';
    if (c.includes('usps')) return 'https://upload.wikimedia.org/wikipedia/commons/e/e0/USPS_Logo.svg';
    return ''; // Placeholder
  }

  getStageIconClass(shipment: Shipment, stageIndex: number): string {
    if (shipment.status === 'canceled') return 'pi pi-times-circle text-red-400';
    if (shipment.current_stage > stageIndex) return 'pi pi-check-circle text-emerald-500';
    if (shipment.current_stage === stageIndex) return 'pi pi-circle-fill text-blue-500';
    return 'pi pi-circle text-slate-300';
  }
}

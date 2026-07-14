import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { ShipmentsApiService } from '../data/shipments-api.service';
import { Shipment, ShipmentStatus } from '../data/shipments.models';

@Component({
  selector: 'app-shipment-detail',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    RouterModule,
    ButtonModule,
    TagModule
  ],
  templateUrl: './shipment-detail.component.html',
  styles: []
})
export class ShipmentDetailComponent implements OnInit {
  private readonly api = inject(ShipmentsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly shipment = signal<Shipment | null>(null);
  readonly mapUrl = signal<string>('');

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadShipment(id);
      }
    });
  }

  loadShipment(id: string) {
    this.api.getShipmentById(id).subscribe({
      next: (s) => {
        this.shipment.set(s);
        this.loadMap(s.origin_address, s.destination_address);
      },
      error: () => {
        this.router.navigate(['/orders/shipments']);
      }
    });
  }

  loadMap(origin: any, dest: any) {
    this.api.getMapPreviewUrl(origin, dest).subscribe(url => {
      this.mapUrl.set(url);
    });
  }

  getStatusClass(status?: ShipmentStatus): string {
    if (!status) return '';
    const base = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ';
    switch (status) {
      case 'arrived': return base + 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'in_progress': return base + 'text-blue-600 bg-blue-50 border-blue-200';
      case 'draft': return base + 'text-amber-600 bg-amber-50 border-amber-200';
      case 'canceled': return base + 'text-red-600 bg-red-50 border-red-200';
      default: return base + 'text-slate-600 bg-slate-50 border-slate-200';
    }
  }

  getStageIconClass(shipment: Shipment | null, stageIndex: number): string {
    if (!shipment) return '';
    if (shipment.status === 'canceled') return 'pi pi-times-circle text-red-400 text-xl';
    if (shipment.current_stage > stageIndex) return 'pi pi-check-circle text-emerald-500 text-xl';
    if (shipment.current_stage === stageIndex) return 'pi pi-circle-fill text-blue-500 text-xl';
    return 'pi pi-circle text-slate-300 text-xl';
  }

  getStageLabelClass(shipment: Shipment | null, stageIndex: number): string {
    if (!shipment) return 'text-slate-400';
    if (shipment.status === 'canceled') return 'text-red-500';
    if (shipment.current_stage >= stageIndex) return 'text-slate-800 font-bold';
    return 'text-slate-400';
  }

  cancelShipment() {
    const s = this.shipment();
    if (!s) return;
    this.api.cancelShipment(s.id).subscribe(res => this.shipment.set(res));
  }
}

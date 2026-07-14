import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { SelectButtonModule } from 'primeng/selectbutton';
import { Product, PerformanceMetric } from '../data/products.models';
import { CatalogApiService } from '../data/catalog-api.service';

@Component({
  selector: 'app-performance-details-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, ChartModule, SelectButtonModule],
  templateUrl: './performance-details-dialog.component.html',
})
export class PerformanceDetailsDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() product!: Product;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() configureAlert = new EventEmitter<void>();

  private readonly mockService = inject(CatalogApiService);

  readonly periods = [
    { label: '2wk', value: '2wk' },
    { label: '1mo', value: '1mo' },
    { label: '2mo', value: '2mo' },
    { label: '3mo', value: '3mo' },
  ];

  readonly selectedPeriod = signal<string>('1mo');
  readonly metrics = signal<PerformanceMetric | null>(null);

  // Chart configuration signals
  readonly salesChartData = signal<any>(null);
  readonly revenueChartData = signal<any>(null);
  readonly comparisonChartData = signal<any>(null);
  readonly aovChartData = signal<any>(null);

  // Headline figures for the two line cards.
  readonly salesThisMonth = signal(0);
  readonly salesLastMonth = signal(0);
  readonly revenueThisMonth = signal(0);
  readonly revenueLastMonth = signal(0);
  readonly aovValue = signal(0);

  private readonly gridColor = 'rgba(148, 163, 184, 0.15)';
  private readonly tickColor = '#94a3b8';

  readonly lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    elements: { point: { radius: 0 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: this.tickColor, font: { size: 9 }, maxTicksLimit: 2 } },
      y: { grid: { color: this.gridColor }, border: { display: false }, ticks: { color: this.tickColor, font: { size: 9 }, maxTicksLimit: 4 } },
    },
  };

  readonly barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: this.tickColor, font: { size: 9 }, maxTicksLimit: 2 } },
      y: { grid: { color: this.gridColor }, border: { display: false }, ticks: { color: this.tickColor, font: { size: 9 }, maxTicksLimit: 4 } },
    },
  };

  readonly hBarOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: this.gridColor }, border: { display: false }, ticks: { color: this.tickColor, font: { size: 9 } } },
      y: { grid: { display: false }, ticks: { display: false } },
    },
  };

  ngOnChanges(changes: SimpleChanges) {
    if (changes['product']?.currentValue || (changes['visible']?.currentValue && this.product)) {
      this.loadMetrics();
    }
  }

  setPeriod(period: string) {
    this.selectedPeriod.set(period);
    this.loadMetrics();
  }

  close() {
    this.visibleChange.emit(false);
  }

  onConfigureAlertClick() {
    this.configureAlert.emit();
    this.close();
  }

  private loadMetrics() {
    if (!this.product) return;
    this.mockService.getPerformanceMetrics(this.product.id, this.selectedPeriod()).subscribe((m) => {
      this.metrics.set(m);
      this.prepareCharts(m);
    });
  }

  private prepareCharts(m: PerformanceMetric) {
    const prior = (arr: number[]) => arr.map((v) => Math.round(v * 0.9));

    // Headline numbers
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    this.salesThisMonth.set(sum(m.sales_data));
    this.salesLastMonth.set(sum(prior(m.sales_data)));
    this.revenueThisMonth.set(Math.round(sum(m.revenue_data) / 100));
    this.revenueLastMonth.set(Math.round(sum(prior(m.revenue_data)) / 100));
    this.aovValue.set(
      m.avg_order_value_data.length
        ? Math.round(sum(m.avg_order_value_data) / m.avg_order_value_data.length)
        : 0,
    );

    // 1. Total Sales — this month vs last month (two lines)
    this.salesChartData.set({
      labels: m.chart_labels,
      datasets: [
        { label: 'This month', data: m.sales_data, borderColor: '#F16D22', backgroundColor: 'transparent', tension: 0.4, borderWidth: 2 },
        { label: 'Last month', data: prior(m.sales_data), borderColor: '#fcc29d', backgroundColor: 'transparent', tension: 0.4, borderWidth: 2 },
      ],
    });

    // 2. Total Revenue — this month vs last month (two lines)
    this.revenueChartData.set({
      labels: m.chart_labels,
      datasets: [
        { label: 'This month', data: m.revenue_data.map((v) => v / 100), borderColor: '#F16D22', backgroundColor: 'transparent', tension: 0.4, borderWidth: 2 },
        { label: 'Last month', data: prior(m.revenue_data).map((v) => v / 100), borderColor: '#fcc29d', backgroundColor: 'transparent', tension: 0.4, borderWidth: 2 },
      ],
    });

    // 3. Product Sale Comparison — horizontal bars
    this.comparisonChartData.set({
      labels: m.product_comparisons.map((p) => p.name),
      datasets: [
        {
          data: m.product_comparisons.map((p) => p.sales),
          backgroundColor: ['#F16D22', '#cbd5e1', '#cbd5e1', '#cbd5e1', '#cbd5e1'],
          borderRadius: 6,
          barThickness: 8,
        },
      ],
    });

    // 4. Average Order Value — bar chart
    this.aovChartData.set({
      labels: m.chart_labels,
      datasets: [
        { label: 'AOV ($)', data: m.avg_order_value_data, backgroundColor: '#F9A06B', borderRadius: 3, barThickness: 8 },
      ],
    });
  }
}

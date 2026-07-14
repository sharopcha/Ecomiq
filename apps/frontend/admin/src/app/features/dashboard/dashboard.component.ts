import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';

import { AuthService } from '../../core/auth/auth.service';
import { DashboardApiService } from './data/dashboard-api.service';
import { DashboardData } from './data/dashboard.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ButtonModule, ChartModule, SkeletonModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(DashboardApiService);

  readonly data = signal<DashboardData | null>(null);
  readonly loading = signal(true);

  // 1. Total Revenue Chart Options (Line chart, 15 points)
  readonly revenueChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: '#0d0d1c',
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 6
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#64748b',
          font: {
            size: 11
          }
        }
      },
      y: {
        position: 'left',
        border: {
          dash: [4, 4],
          display: false
        },
        grid: {
          color: '#f1f5f9'
        },
        ticks: {
          color: '#64748b',
          font: {
            size: 11
          },
          callback: (value: any) => {
            if (value >= 1000) return '$' + (value / 1000) + 'K';
            return '$' + value;
          }
        }
      }
    }
  };

  // 2. Average Order Value Chart Options (Bar chart, Y-axis on the right, no X labels)
  readonly orderValueChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          display: false // Hidden to let custom HTML render Feb 01 ... Feb 28
        }
      },
      y: {
        position: 'right',
        border: {
          dash: [4, 4],
          display: false
        },
        grid: {
          color: '#f1f5f9'
        },
        ticks: {
          color: '#64748b',
          font: {
            size: 11
          },
          callback: (value: any) => {
            if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'K';
            return '$' + value;
          }
        }
      }
    }
  };

  // 3. Average Sales Chart Options (Line chart, no X labels, left Y-axis)
  readonly salesChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          display: false
        }
      },
      y: {
        position: 'left',
        border: {
          dash: [4, 4],
          display: false
        },
        grid: {
          color: '#f1f5f9'
        },
        ticks: {
          color: '#64748b',
          font: {
            size: 11
          },
          callback: (value: any) => {
            if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
            return value;
          }
        }
      }
    }
  };

  // 4. Total Sessions Chart Options (Clustered Bar chart, completely hidden Y-axis, hidden X ticks)
  readonly sessionsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          display: false
        }
      },
      y: {
        display: false,
        grid: {
          display: false
        }
      }
    }
  };

  ngOnInit() {
    this.api.getDashboardData().subscribe({
      next: (res) => {
        // Post-process Average Sales chart to only show a point marker at the very last index of the series
        if (res.average_sales_chart && res.average_sales_chart.datasets) {
          const thisMonthDataset = res.average_sales_chart.datasets.find(d => d.label === 'This Month');
          if (thisMonthDataset && thisMonthDataset.data) {
            const dataLength = thisMonthDataset.data.length;
            const pointRadii = Array(dataLength - 1).fill(0).concat([5]);
            
            // Assign point styling
            (thisMonthDataset as any).pointRadius = pointRadii;
            (thisMonthDataset as any).pointHoverRadius = pointRadii.map(r => r > 0 ? 7 : 0);
            (thisMonthDataset as any).pointBackgroundColor = '#F16D22';
            (thisMonthDataset as any).pointBorderColor = '#ffffff';
            (thisMonthDataset as any).pointBorderWidth = 2;
          }

          // Disable points completely on last month dataset
          const lastMonthDataset = res.average_sales_chart.datasets.find(d => d.label === 'Last Month');
          if (lastMonthDataset) {
            (lastMonthDataset as any).pointRadius = 0;
            (lastMonthDataset as any).pointHoverRadius = 0;
          }
        }

        // Post-process Total Revenue line datasets to remove circle markers entirely
        if (res.total_revenue_chart && res.total_revenue_chart.datasets) {
          res.total_revenue_chart.datasets.forEach(d => {
            (d as any).pointRadius = 0;
            (d as any).pointHoverRadius = 4;
          });
        }

        this.data.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  getFirstName(): string {
    const fullName = this.auth.user()?.fullName || 'Fikri';
    return fullName.split(' ')[0];
  }

  getCurrentDate(): string {
    // Matches: Monday, 24 February 2024
    return new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  }

  calculateProgress(sales: number, max: number): string {
    return `${(sales / max) * 100}%`;
  }
}

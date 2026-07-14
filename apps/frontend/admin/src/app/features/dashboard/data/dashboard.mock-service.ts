import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { DashboardData } from './dashboard.models';

@Injectable({
  providedIn: 'root'
})
export class DashboardMockService {
  
  /**
   * Mock returning dashboard data.
   * This is a seam for the future analytics-service.
   */
  getDashboardData(): Observable<DashboardData> {
    // Generate 28 points for February (Feb 01 to Feb 28)
    const febDays28 = Array.from({ length: 28 }, (_, i) => {
      const day = i + 1;
      return `Feb ${day < 10 ? '0' + day : day}`;
    });

    // We only display Feb 01 and Feb 28 labels on the X-axis for some charts,
    // but the dataset labels array will have the full days.
    const averageOrderValueData = [
      650, 780, 920, 810, 1150, 1100, 850, 720, 900, 1050,
      1200, 980, 890, 750, 1120, 1080, 950, 820, 930, 1020,
      1180, 940, 880, 710, 1250, 1150, 990, 300
    ];

    // Average Sales line data: 28 days
    const averageSalesThisMonth = [
      320, 350, 480, 420, 550, 610, 680, 620, 580, 520,
      600, 720, 780, 840, 790, 710, 650, 620, 580, 650,
      720, 690, 640, 720, 810, 900, 950, 980
    ];
    const averageSalesLastMonth = [
      450, 480, 510, 490, 580, 640, 600, 550, 520, 580,
      620, 680, 710, 750, 730, 680, 620, 590, 650, 700,
      740, 720, 680, 710, 770, 820, 800, 780
    ];

    // Total Sessions: 14 intervals for "User per 2 days"
    const sessionsLabels = Array.from({ length: 14 }, (_, i) => `Feb ${i * 2 + 1 < 10 ? '0' + (i * 2 + 1) : i * 2 + 1}`);
    const sessionsThisMonth = [
      780, 850, 920, 880, 990, 1050, 890, 920, 1010, 960, 1080, 1120, 1150, 1020
    ];
    const sessionsLastMonth = [
      650, 710, 800, 750, 880, 910, 820, 860, 930, 890, 980, 1020, 1050, 920
    ];

    const data: DashboardData = {
      kpis: {
        sales_performance: {
          label: 'Sales performance',
          value: '$23,127',
          delta_percent: 12,
          trend: 'up'
        },
        total_sales: {
          label: 'Total Sales',
          value: '1,849',
          delta_percent: 3,
          trend: 'up'
        },
        average_revenue: {
          label: 'Average Revenue',
          value: '$15,239',
          delta_percent: 8,
          trend: 'up'
        },
        average_order: {
          label: 'Average Order',
          value: '2,034',
          delta_percent: -3,
          trend: 'down'
        }
      },
      total_revenue_chart: {
        labels: ['Feb 01', '03', '05', '07', '09', '11', '13', '15', '17', '19', '21', '23', '25', '27', '28'],
        datasets: [
          {
            label: 'This Month',
            data: [400, 300, 950, 650, 400, 200, 200, 100, 400, 300, 600, 500, 750, 900, 700],
            borderColor: '#1e1e30',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4
          },
          {
            label: 'Last Month',
            data: [200, 450, 400, 500, 350, 500, 700, 550, 450, 550, 400, 700, 600, 800, 650],
            borderColor: '#cbd5e1',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4
          }
        ]
      },
      popular_products: [
        { id: '1', name: 'Macbook Air M2 2022 13 Inch', sales: 8172, max_sales: 8500 },
        { id: '2', name: 'Macbook Pro 14 Inch 512GB M1 Pro', sales: 6345, max_sales: 8500 },
        { id: '3', name: 'Apple Mac Mini Pro M2 2023', sales: 3287, max_sales: 8500 },
        { id: '4', name: 'APPLE 32" R6KD Pro Display XDR', sales: 2456, max_sales: 8500 }
      ],
      average_order_value_chart: {
        labels: febDays28,
        datasets: [
          {
            label: 'Average Order Value',
            data: averageOrderValueData,
            backgroundColor: '#F16D22',
            borderRadius: 4
          }
        ]
      },
      average_sales_chart: {
        labels: febDays28,
        datasets: [
          {
            label: 'This Month',
            data: averageSalesThisMonth,
            borderColor: '#F16D22',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4
          },
          {
            label: 'Last Month',
            data: averageSalesLastMonth,
            borderColor: '#fed7aa',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4
          }
        ]
      },
      total_sessions_chart: {
        labels: sessionsLabels,
        datasets: [
          {
            label: 'This Month',
            data: sessionsThisMonth,
            backgroundColor: '#475569',
            borderRadius: 4
          },
          {
            label: 'Last Month',
            data: sessionsLastMonth,
            backgroundColor: '#cbd5e1',
            borderRadius: 4
          }
        ]
      }
    };

    return of(data).pipe(delay(300));
  }
}

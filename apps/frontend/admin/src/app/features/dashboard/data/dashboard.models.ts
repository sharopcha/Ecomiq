export interface KpiStat {
  label: string;
  value: string;
  delta_percent: number;
  trend: 'up' | 'down';
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  borderColor?: string;
  backgroundColor?: string;
  borderDash?: number[];
  fill?: boolean;
  tension?: number;
  barThickness?: number;
  borderRadius?: number;
}

export interface PopularProduct {
  id: string;
  name: string;
  sales: number;
  max_sales: number;
}

export interface DashboardData {
  kpis: {
    sales_performance: KpiStat;
    total_sales: KpiStat;
    average_revenue: KpiStat;
    average_order: KpiStat;
  };
  total_revenue_chart: ChartData;
  popular_products: PopularProduct[];
  average_order_value_chart: ChartData;
  average_sales_chart: ChartData;
  total_sessions_chart: ChartData;
}

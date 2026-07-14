export type ProductStatus = 'active' | 'draft' | 'archived';
export type ProductKind = 'physical' | 'digital';

export interface Category {
  id: string;
  name: string;
  parent_id?: string;
}

export interface Vendor {
  id: string;
  name: string;
}

export interface ProductType {
  id: string;
  name: string;
}

export type ChannelKind = 'online_store' | 'pos' | 'manual' | 'marketplace' | 'mobile_app';

export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
}

export interface Tag {
  id: string;
  name: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  file_id: string;
  url: string;
  position: number;
}

export interface Product {
  id: string;
  store_id: string;
  display_number: number;
  name: string;
  description: string;
  status: ProductStatus;
  kind: ProductKind;
  sku?: string;
  category_id?: string;
  type_id?: string;
  vendor_id?: string;
  price_minor?: number; // integer minor units
  compare_at_minor?: number; // integer minor units
  cost_minor?: number; // integer minor units
  wholesale_min_minor?: number;
  wholesale_max_minor?: number;
  charge_tax: boolean;
  weight_value?: number;
  weight_unit: string;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  ships_internationally: boolean;
  continue_selling_oos: boolean;
  is_dropship: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProductOption {
  id: string;
  product_id: string;
  name: string;
  position: number;
  use_images: boolean;
}

export interface ProductOptionValue {
  id: string;
  option_id: string;
  value: string;
  swatch?: string;
  image_file_id?: string;
  position: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  price_minor?: number;
  is_active: boolean;
  is_default: boolean;
  image_file_id?: string;
  /** Editable on-hand quantity surfaced in the Add Variants table (display/edit seam
   *  for the future StockLevel record). */
  stock?: number;
  option_values: { optionName: string; valueName: string; valueId: string }[];
}

export interface Location {
  id: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
}

export interface StockLevel {
  id: string;
  variant_id: string;
  location_id: string;
  on_hand: number;
  reserved: number;
  low_threshold?: number;
  unit_cost_minor?: number;
}

export interface ProductComment {
  id: string;
  product_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  created_at: string;
  is_staff: boolean;
}

export interface PerformanceMetric {
  period: string; // '2wk' | '1mo' | '2mo' | '3mo'
  total_sales: number;
  total_revenue_minor: number;
  sales_data: number[];
  revenue_data: number[];
  chart_labels: string[];
  product_comparisons: { name: string; sales: number; percent: number }[];
  avg_order_value_data: number[];
}

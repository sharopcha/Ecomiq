import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import {
  Product,
  Category,
  Vendor,
  ProductType,
  Channel,
  Tag,
  ProductVariant,
  StockLevel,
  Location,
  ProductComment,
  PerformanceMetric,
  ProductStatus,
  ProductKind,
  ProductOption,
  ProductOptionValue
} from './products.models';

/**
 * Temporary mock service standing in for the `catalog-service` backend.
 * Swapping for an HttpClient-based service later will require minimal modifications.
 */
@Injectable({ providedIn: 'root' })
export class ProductsMockService {
  private categories: Category[] = [
    { id: 'cat-1', name: 'Laptops' },
    { id: 'cat-2', name: 'Smartphones' },
    { id: 'cat-3', name: 'Tablets' },
    { id: 'cat-4', name: 'Audio' },
    { id: 'cat-5', name: 'Smart Watches' }
  ];

  private vendors: Vendor[] = [
    { id: 'ven-1', name: 'Apple' },
    { id: 'ven-2', name: 'Sony' },
    { id: 'ven-3', name: 'Samsung' },
    { id: 'ven-4', name: 'Dell' },
    { id: 'ven-5', name: 'Bose' }
  ];

  private productTypes: ProductType[] = [
    { id: 'type-1', name: 'Electronic' },
    { id: 'type-2', name: 'Gadget' },
    { id: 'type-3', name: 'Software' },
    { id: 'type-4', name: 'Accessories' }
  ];

  private channels: Channel[] = [
    { id: 'chan-1', name: 'Ecomiq Store +', kind: 'online_store' },
    { id: 'chan-2', name: 'Online Store', kind: 'online_store' },
    { id: 'chan-3', name: 'Amazon Marketplace', kind: 'marketplace' },
    { id: 'chan-4', name: 'eBay', kind: 'marketplace' }
  ];

  private tags: Tag[] = [
    { id: 'tag-1', name: 'Apple' },
    { id: 'tag-2', name: 'Premium' },
    { id: 'tag-3', name: 'Wireless' },
    { id: 'tag-4', name: 'Noise Cancelling' },
    { id: 'tag-5', name: 'Dropship' },
    { id: 'tag-6', name: 'Bestseller' }
  ];

  private locations: Location[] = [
    { id: 'loc-1', name: 'Main Warehouse', is_active: true, is_default: true },
    { id: 'loc-2', name: 'Europe Hub', is_active: true, is_default: false }
  ];

  // In-memory products store
  private products: Product[] = [
    {
      id: 'prod-1',
      store_id: 'store-123',
      display_number: 12567,
      name: 'MacBook Pro 16" M3 Max',
      description: 'Supercharged by M3 Max, the MacBook Pro 16-inch is an absolute beast for developers, creators, and professionals. Features a liquid retina XDR display and up to 22 hours of battery life.',
      status: 'active',
      kind: 'physical',
      sku: 'MAC-16-M3M',
      category_id: 'cat-1',
      type_id: 'type-1',
      vendor_id: 'ven-1',
      price_minor: 249900,
      compare_at_minor: 269900,
      cost_minor: 180000,
      wholesale_min_minor: 219900,
      wholesale_max_minor: 229900,
      charge_tax: true,
      weight_value: 2.16,
      weight_unit: 'kg',
      length_cm: 35.57,
      width_cm: 24.81,
      height_cm: 1.68,
      ships_internationally: true,
      continue_selling_oos: false,
      is_dropship: false,
      rating_avg: 4.8,
      rating_count: 886,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'prod-2',
      store_id: 'store-123',
      display_number: 12568,
      name: 'Sony WH-1000XM5',
      description: 'Industry-leading noise cancelling wireless headphones. Equipped with two processors controlling eight microphones, auto noise cancelling optimizer, and hands-free calling.',
      status: 'active',
      kind: 'physical',
      sku: 'SONY-XM5-B',
      category_id: 'cat-4',
      type_id: 'type-4',
      vendor_id: 'ven-2',
      price_minor: 39900,
      compare_at_minor: 44900,
      cost_minor: 25000,
      wholesale_min_minor: 32900,
      wholesale_max_minor: 34900,
      charge_tax: true,
      weight_value: 0.25,
      weight_unit: 'kg',
      length_cm: 22.5,
      width_cm: 18.0,
      height_cm: 7.5,
      ships_internationally: true,
      continue_selling_oos: false,
      is_dropship: true,
      rating_avg: 4.6,
      rating_count: 120,
      created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'prod-3',
      store_id: 'store-123',
      display_number: 12569,
      name: 'iPhone 15 Pro Max',
      description: 'Forged in titanium and featuring the groundbreaking A17 Pro chip, a customizable Action button, and the most powerful iPhone camera system ever.',
      status: 'draft',
      kind: 'physical',
      sku: 'IPH-15PM-256',
      category_id: 'cat-2',
      type_id: 'type-2',
      vendor_id: 'ven-1',
      price_minor: 119900,
      compare_at_minor: 119900,
      cost_minor: 75000,
      wholesale_min_minor: 99900,
      wholesale_max_minor: 104900,
      charge_tax: true,
      weight_value: 0.22,
      weight_unit: 'kg',
      length_cm: 15.99,
      width_cm: 7.67,
      height_cm: 0.83,
      ships_internationally: false,
      continue_selling_oos: false,
      is_dropship: false,
      rating_avg: 4.9,
      rating_count: 54,
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'prod-4',
      store_id: 'store-123',
      display_number: 12570,
      name: 'Samsung Galaxy Tab S9 Ultra',
      description: 'The standard for premium tablets. Dynamic AMOLED 2X screen, IP68 water resistance, and the included S Pen. Powerful Snapdragon 8 Gen 2 processor.',
      status: 'archived',
      kind: 'physical',
      sku: 'SAM-TAB-S9U',
      category_id: 'cat-3',
      type_id: 'type-1',
      vendor_id: 'ven-3',
      price_minor: 109900,
      compare_at_minor: 119900,
      cost_minor: 70000,
      wholesale_min_minor: 89900,
      wholesale_max_minor: 94900,
      charge_tax: true,
      weight_value: 0.73,
      weight_unit: 'kg',
      length_cm: 32.64,
      width_cm: 20.86,
      height_cm: 0.55,
      ships_internationally: true,
      continue_selling_oos: true,
      is_dropship: true,
      rating_avg: 4.5,
      rating_count: 45,
      created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  // In-memory images mapping
  private productImages: Record<string, string[]> = {
    'prod-1': [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=60',
      'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=500&auto=format&fit=crop&q=60',
      'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500&auto=format&fit=crop&q=60'
    ],
    'prod-2': [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60',
      'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500&auto=format&fit=crop&q=60'
    ],
    'prod-3': [
      'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=500&auto=format&fit=crop&q=60',
      'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=60'
    ],
    'prod-4': [
      'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500&auto=format&fit=crop&q=60'
    ]
  };

  // In-memory options mapping
  private productOptions: Record<string, ProductOption[]> = {
    'prod-1': [
      { id: 'opt-1-1', product_id: 'prod-1', name: 'Color', position: 1, use_images: true },
      { id: 'opt-1-2', product_id: 'prod-1', name: 'SSD Size', position: 2, use_images: false }
    ],
    'prod-2': [
      { id: 'opt-2-1', product_id: 'prod-2', name: 'Color', position: 1, use_images: true }
    ],
    'prod-3': [
      { id: 'opt-3-1', product_id: 'prod-3', name: 'Color', position: 1, use_images: true },
      { id: 'opt-3-2', product_id: 'prod-3', name: 'Storage', position: 2, use_images: false }
    ]
  };

  // In-memory option values mapping
  private productOptionValues: Record<string, ProductOptionValue[]> = {
    'opt-1-1': [
      { id: 'val-1-1-1', option_id: 'opt-1-1', value: 'Midnight', swatch: '#1e293b', position: 1, image_file_id: 'img-1-1' },
      { id: 'val-1-1-2', option_id: 'opt-1-1', value: 'Silver', swatch: '#cbd5e1', position: 2, image_file_id: 'img-1-2' },
      { id: 'val-1-1-3', option_id: 'opt-1-1', value: 'Starlight', swatch: '#f1f5f9', position: 3, image_file_id: 'img-1-3' }
    ],
    'opt-1-2': [
      { id: 'val-1-2-1', option_id: 'opt-1-2', value: '512GB', position: 1 },
      { id: 'val-1-2-2', option_id: 'opt-1-2', value: '1TB', position: 2 },
      { id: 'val-1-2-3', option_id: 'opt-1-2', value: '2TB', position: 3 }
    ],
    'opt-2-1': [
      { id: 'val-2-1-1', option_id: 'opt-2-1', value: 'Black', swatch: '#000000', position: 1 },
      { id: 'val-2-1-2', option_id: 'opt-2-1', value: 'Silver', swatch: '#e2e8f0', position: 2 }
    ],
    'opt-3-1': [
      { id: 'val-3-1-1', option_id: 'opt-3-1', value: 'Titanium Grey', swatch: '#71717a', position: 1 },
      { id: 'val-3-1-2', option_id: 'opt-3-1', value: 'Titanium Blue', swatch: '#1d4ed8', position: 2 }
    ],
    'opt-3-2': [
      { id: 'val-3-2-1', option_id: 'opt-3-2', value: '256GB', position: 1 },
      { id: 'val-3-2-2', option_id: 'opt-3-2', value: '512GB', position: 2 }
    ]
  };

  // In-memory variants mapping
  private productVariants: Record<string, ProductVariant[]> = {
    'prod-1': [
      {
        id: 'var-1-1', product_id: 'prod-1', sku: 'MAC-16-M3M-MID-512', price_minor: 249900, is_active: true, is_default: true,
        option_values: [
          { optionName: 'Color', valueName: 'Midnight', valueId: 'val-1-1-1' },
          { optionName: 'SSD Size', valueName: '512GB', valueId: 'val-1-2-1' }
        ]
      },
      {
        id: 'var-1-2', product_id: 'prod-1', sku: 'MAC-16-M3M-MID-1T', price_minor: 269900, is_active: true, is_default: false,
        option_values: [
          { optionName: 'Color', valueName: 'Midnight', valueId: 'val-1-1-1' },
          { optionName: 'SSD Size', valueName: '1TB', valueId: 'val-1-2-2' }
        ]
      },
      {
        id: 'var-1-3', product_id: 'prod-1', sku: 'MAC-16-M3M-SIL-512', price_minor: 249900, is_active: true, is_default: false,
        option_values: [
          { optionName: 'Color', valueName: 'Silver', valueId: 'val-1-1-2' },
          { optionName: 'SSD Size', valueName: '512GB', valueId: 'val-1-2-1' }
        ]
      },
      {
        id: 'var-1-4', product_id: 'prod-1', sku: 'MAC-16-M3M-SIL-1T', price_minor: 269900, is_active: false, is_default: false,
        option_values: [
          { optionName: 'Color', valueName: 'Silver', valueId: 'val-1-1-2' },
          { optionName: 'SSD Size', valueName: '1TB', valueId: 'val-1-2-2' }
        ]
      }
    ],
    'prod-2': [
      {
        id: 'var-2-1', product_id: 'prod-2', sku: 'SONY-XM5-BLK', price_minor: 39900, is_active: true, is_default: true,
        option_values: [
          { optionName: 'Color', valueName: 'Black', valueId: 'val-2-1-1' }
        ]
      },
      {
        id: 'var-2-2', product_id: 'prod-2', sku: 'SONY-XM5-SLV', price_minor: 39900, is_active: true, is_default: false,
        option_values: [
          { optionName: 'Color', valueName: 'Silver', valueId: 'val-2-1-2' }
        ]
      }
    ],
    'prod-3': [
      {
        id: 'var-3-1', product_id: 'prod-3', sku: 'IPH-15PM-GRY-256', price_minor: 119900, is_active: true, is_default: true,
        option_values: [
          { optionName: 'Color', valueName: 'Titanium Grey', valueId: 'val-3-1-1' },
          { optionName: 'Storage', valueName: '256GB', valueId: 'val-3-2-1' }
        ]
      }
    ]
  };

  // In-memory stock levels mapping (variant_id -> stock info)
  private stockLevels: Record<string, StockLevel[]> = {
    'var-1-1': [{ id: 'stk-1-1', variant_id: 'var-1-1', location_id: 'loc-1', on_hand: 120, reserved: 10, low_threshold: 20 }],
    'var-1-2': [{ id: 'stk-1-2', variant_id: 'var-1-2', location_id: 'loc-1', on_hand: 50, reserved: 2, low_threshold: 20 }],
    'var-1-3': [{ id: 'stk-1-3', variant_id: 'var-1-3', location_id: 'loc-1', on_hand: 40, reserved: 5, low_threshold: 20 }],
    'var-1-4': [{ id: 'stk-1-4', variant_id: 'var-1-4', location_id: 'loc-1', on_hand: 0, reserved: 0, low_threshold: 10 }],
    'var-2-1': [{ id: 'stk-2-1', variant_id: 'var-2-1', location_id: 'loc-1', on_hand: 10, reserved: 1, low_threshold: 5 }],
    'var-2-2': [{ id: 'stk-2-2', variant_id: 'var-2-2', location_id: 'loc-1', on_hand: 5, reserved: 0, low_threshold: 5 }],
    'var-3-1': [{ id: 'stk-3-1', variant_id: 'var-3-1', location_id: 'loc-1', on_hand: 0, reserved: 0, low_threshold: 15 }]
  };

  // In-memory activity feed comments mapping (product_id -> comments)
  private comments: Record<string, ProductComment[]> = {
    'prod-1': [
      {
        id: 'com-1',
        product_id: 'prod-1',
        author_name: 'Dianne Russell',
        author_avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=60',
        content: 'I have updated the pricing for the retail channel. Wholesale prices are untouched.',
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        is_staff: true
      },
      {
        id: 'com-2',
        product_id: 'prod-1',
        author_name: 'Ecomiq Store Assistant (AI)',
        author_avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60',
        content: 'Product sales are up by 15% this week. I recommend creating a bundle with wireless accessories.',
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        is_staff: true
      }
    ],
    'prod-2': [
      {
        id: 'com-3',
        product_id: 'prod-2',
        author_name: 'Brooklyn Simmons',
        author_avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=60',
        content: 'Stock level is critical (only 15 left in Main Warehouse). Reorder point triggered.',
        created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        is_staff: true
      }
    ]
  };


  // Products CRUD
  getProducts(): Observable<Product[]> {
    return of(this.products).pipe(delay(300));
  }

  getProductById(id: string): Observable<Product | undefined> {
    const product = this.products.find(p => p.id === id);
    return of(product).pipe(delay(200));
  }

  createProduct(product: Partial<Product>): Observable<Product> {
    const newProduct: Product = {
      id: 'prod-' + (this.products.length + 1),
      store_id: 'store-123',
      display_number: 12570 + this.products.length,
      name: product.name || 'New Product',
      description: product.description || '',
      status: product.status || 'draft',
      kind: product.kind || 'physical',
      sku: product.sku || '',
      category_id: product.category_id,
      type_id: product.type_id,
      vendor_id: product.vendor_id,
      price_minor: product.price_minor || 0,
      compare_at_minor: product.compare_at_minor || 0,
      cost_minor: product.cost_minor || 0,
      wholesale_min_minor: product.wholesale_min_minor || 0,
      wholesale_max_minor: product.wholesale_max_minor || 0,
      charge_tax: product.charge_tax ?? false,
      weight_value: product.weight_value ?? 0,
      weight_unit: product.weight_unit ?? 'kg',
      length_cm: product.length_cm,
      width_cm: product.width_cm,
      height_cm: product.height_cm,
      ships_internationally: product.ships_internationally ?? false,
      continue_selling_oos: product.continue_selling_oos ?? false,
      is_dropship: product.is_dropship ?? false,
      rating_avg: 5.0,
      rating_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.products.push(newProduct);
    this.productImages[newProduct.id] = [];
    this.productOptions[newProduct.id] = [];
    this.productVariants[newProduct.id] = [];
    return of(newProduct).pipe(delay(300));
  }

  updateProduct(id: string, updates: Partial<Product>): Observable<Product> {
    const idx = this.products.findIndex(p => p.id === id);
    if (idx === -1) return throwError(() => new Error('Product not found'));
    
    this.products[idx] = {
      ...this.products[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    return of(this.products[idx]).pipe(delay(200));
  }

  deleteProduct(id: string): Observable<boolean> {
    this.products = this.products.filter(p => p.id !== id);
    return of(true).pipe(delay(200));
  }

  // Categories, Vendors, Types, Channels, Tags
  getCategories(): Observable<Category[]> {
    return of(this.categories);
  }

  getVendors(): Observable<Vendor[]> {
    return of(this.vendors);
  }

  getProductTypes(): Observable<ProductType[]> {
    return of(this.productTypes);
  }

  getChannels(): Observable<Channel[]> {
    return of(this.channels);
  }

  getTags(): Observable<Tag[]> {
    return of(this.tags);
  }

  getLocations(): Observable<Location[]> {
    return of(this.locations);
  }

  // Product Images
  getProductImages(productId: string): Observable<string[]> {
    return of(this.productImages[productId] || []);
  }

  addProductImage(productId: string, imageUrl: string): Observable<string[]> {
    if (!this.productImages[productId]) {
      this.productImages[productId] = [];
    }
    this.productImages[productId].push(imageUrl);
    return of(this.productImages[productId]);
  }

  removeProductImage(productId: string, imageUrl: string): Observable<string[]> {
    if (this.productImages[productId]) {
      this.productImages[productId] = this.productImages[productId].filter(img => img !== imageUrl);
    }
    return of(this.productImages[productId] || []);
  }

  // Product Options & Values
  getProductOptions(productId: string): Observable<ProductOption[]> {
    return of(this.productOptions[productId] || []);
  }

  getOptionValues(optionId: string): Observable<ProductOptionValue[]> {
    return of(this.productOptionValues[optionId] || []);
  }

  saveProductOptionsAndValues(
    productId: string, 
    options: { name: string; values: string[]; useImages: boolean }[]
  ): Observable<boolean> {
    // Overwrite options & option values for simplicity
    const newOptions: ProductOption[] = options.map((o, idx) => ({
      id: `opt-${productId}-${idx}-${Date.now()}`,
      product_id: productId,
      name: o.name,
      position: idx + 1,
      use_images: o.useImages
    }));

    this.productOptions[productId] = newOptions;

    newOptions.forEach((opt, idx) => {
      const formOpt = options[idx];
      const optValues: ProductOptionValue[] = formOpt.values.map((v, vIdx) => ({
        id: `val-${opt.id}-${vIdx}-${Date.now()}`,
        option_id: opt.id,
        value: v,
        position: vIdx + 1
      }));
      this.productOptionValues[opt.id] = optValues;
    });

    return of(true).pipe(delay(300));
  }

  // Product Variants
  getProductVariants(productId: string): Observable<ProductVariant[]> {
    return of(this.productVariants[productId] || []);
  }

  saveProductVariants(productId: string, variants: ProductVariant[]): Observable<ProductVariant[]> {
    this.productVariants[productId] = variants;
    // Mock stock levels for new variants
    variants.forEach(v => {
      if (!this.stockLevels[v.id]) {
        this.stockLevels[v.id] = [
          { id: `stk-${v.id}-${Date.now()}`, variant_id: v.id, location_id: 'loc-1', on_hand: 50, reserved: 0, low_threshold: 10 }
        ];
      }
    });
    return of(this.productVariants[productId]);
  }

  getVariantStockLevels(variantId: string): Observable<StockLevel[]> {
    return of(this.stockLevels[variantId] || []);
  }

  updateVariantStock(variantId: string, locationId: string, qty: number): Observable<boolean> {
    const levels = this.stockLevels[variantId] || [];
    const lvl = levels.find(l => l.location_id === locationId);
    if (lvl) {
      lvl.on_hand = qty;
    } else {
      levels.push({
        id: `stk-${variantId}-${Date.now()}`,
        variant_id: variantId,
        location_id: locationId,
        on_hand: qty,
        reserved: 0,
        low_threshold: 10
      });
      this.stockLevels[variantId] = levels;
    }
    return of(true);
  }

  // Total stock rolled up for a product
  getProductTotalStock(productId: string): Observable<{ count: number; status: 'High' | 'Low' | 'Out of Stock' }> {
    const variants = this.productVariants[productId] || [];
    if (variants.length === 0) {
      // Return a base mock stock since there are no variants
      // For prod-1: 210, prod-2: 15, prod-3: 0, prod-4: 80
      let count = 0;
      if (productId === 'prod-1') count = 210;
      else if (productId === 'prod-2') count = 15;
      else if (productId === 'prod-3') count = 0;
      else if (productId === 'prod-4') count = 80;

      const status = count > 50 ? 'High' : count > 0 ? 'Low' : 'Out of Stock';
      return of({ count, status });
    }

    let total = 0;
    let anyLow = false;
    variants.forEach(v => {
      const stock = this.stockLevels[v.id] || [];
      stock.forEach(s => {
        total += s.on_hand;
        if (s.low_threshold && s.on_hand <= s.low_threshold) {
          anyLow = true;
        }
      });
    });

    let status: 'High' | 'Low' | 'Out of Stock' = 'High';
    if (total === 0) status = 'Out of Stock';
    else if (anyLow || total <= 20) status = 'Low';

    return of({ count: total, status });
  }

  // Comments / Feed
  getComments(productId: string): Observable<ProductComment[]> {
    return of(this.comments[productId] || []).pipe(
      map((list: ProductComment[]) => [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    );
  }

  addComment(productId: string, content: string): Observable<ProductComment> {
    if (!this.comments[productId]) {
      this.comments[productId] = [];
    }
    const newComment: ProductComment = {
      id: `com-${Date.now()}`,
      product_id: productId,
      author_name: 'Store Owner',
      author_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=60',
      content: content,
      created_at: new Date().toISOString(),
      is_staff: true
    };
    this.comments[productId].push(newComment);
    return of(newComment).pipe(delay(100));
  }

  // Performance Metrics
  getPerformanceMetrics(productId: string, period: string): Observable<PerformanceMetric> {
    const isWk2 = period === '2wk';
    const isMo1 = period === '1mo';
    const isMo2 = period === '2mo';
    const mult = isWk2 ? 0.5 : isMo1 ? 1 : isMo2 ? 2 : 3;

    const baseSales = productId === 'prod-1' ? 450 : productId === 'prod-2' ? 120 : productId === 'prod-3' ? 0 : 80;
    const baseRev = productId === 'prod-1' ? 11245000 : productId === 'prod-2' ? 4788000 : productId === 'prod-3' ? 0 : 6392000;

    const chartLabels = isWk2 
      ? ['Week 1', 'Week 2'] 
      : isMo1 
      ? ['Week 1', 'Week 2', 'Week 3', 'Week 4']
      : isMo2
      ? ['Month 1 (W1-2)', 'Month 1 (W3-4)', 'Month 2 (W1-2)', 'Month 2 (W3-4)']
      : ['Month 1', 'Month 2', 'Month 3'];

    const len = chartLabels.length;
    const salesData: number[] = [];
    const revenueData: number[] = [];

    const unitPrice = productId === 'prod-1' ? 2499 : productId === 'prod-2' ? 399 : productId === 'prod-3' ? 1199 : 1099;

    for (let i = 0; i < len; i++) {
      const fact = 0.7 + Math.random() * 0.6;
      const s = Math.round((baseSales / len) * fact * mult);
      salesData.push(s);
      revenueData.push(Math.round(s * unitPrice * 100));
    }

    const metric: PerformanceMetric = {
      period,
      total_sales: Math.round(baseSales * mult),
      total_revenue_minor: Math.round(baseRev * mult),
      sales_data: salesData,
      revenue_data: revenueData,
      chart_labels: chartLabels,
      product_comparisons: [
        { name: 'This Product (Retail)', sales: Math.round(baseSales * mult * 0.7), percent: 70 },
        { name: 'Wholesale Orders', sales: Math.round(baseSales * mult * 0.2), percent: 20 },
        { name: 'Dropship Direct', sales: Math.round(baseSales * mult * 0.1), percent: 10 }
      ],
      avg_order_value_data: [890, 910, 950, 992].slice(0, len)
    };

    return of(metric).pipe(delay(200));
  }
}

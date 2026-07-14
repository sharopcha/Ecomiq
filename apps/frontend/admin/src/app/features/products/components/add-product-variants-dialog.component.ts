import { Component, Input, Output, EventEmitter, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { CheckboxModule } from 'primeng/checkbox';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputNumberModule } from 'primeng/inputnumber';
import { Product, ProductVariant, ProductOption, ProductOptionValue } from '../data/products.models';
import { CatalogApiService } from '../data/catalog-api.service';

interface OptionConfig {
  name: string;
  valuesString: string; // comma separated values e.g. "Midnight, Silver, Starlight"
  useImages: boolean;
}

@Component({
  selector: 'app-add-product-variants-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    ToggleSwitchModule,
    TableModule,
    CheckboxModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputNumberModule,
  ],
  templateUrl: './add-product-variants-dialog.component.html',
})
export class AddProductVariantsDialogComponent implements OnInit {
  @Input() visible = false;
  @Input() product!: Product;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() variantsSaved = new EventEmitter<void>();

  private readonly mockService = inject(CatalogApiService);

  readonly variantTypes = [
    { label: 'Color', value: 'Color' },
    { label: 'SSD Size', value: 'SSD Size' },
    { label: 'Storage', value: 'Storage' },
    { label: 'Size', value: 'Size' },
    { label: 'Material', value: 'Material' },
  ];

  // Configured options
  readonly optionsConfigs = signal<OptionConfig[]>([
    { name: 'Color', valuesString: 'Midnight, Silver, Starlight', useImages: true }
  ]);

  // Generated variants list
  readonly generatedVariants = signal<ProductVariant[]>([]);

  // Resolved names for the "Product detail" recap row.
  readonly categoryName = signal('—');
  readonly vendorName = signal('—');
  readonly typeName = signal('—');
  readonly channelName = signal('Fikri Store');

  ngOnInit() {
    if (this.product) {
      this.resolveRecapNames();
    }
    if (this.product) {
      // Try to load existing options & variants from mock service
      this.mockService.getProductOptions(this.product.id).subscribe((opts) => {
        if (opts.length > 0) {
          const configs: OptionConfig[] = [];
          
          // Fetch option values sequentially
          let loadedCount = 0;
          opts.forEach((opt) => {
            this.mockService.getOptionValues(opt.id).subscribe((vals) => {
              configs.push({
                name: opt.name,
                valuesString: vals.map((v) => v.value).join(', '),
                useImages: opt.use_images
              });
              loadedCount++;
              
              if (loadedCount === opts.length) {
                // Sort by position to preserve order
                configs.sort((a, b) => {
                  const optA = opts.find((o) => o.name === a.name);
                  const optB = opts.find((o) => o.name === b.name);
                  return (optA?.position ?? 0) - (optB?.position ?? 0);
                });
                this.optionsConfigs.set(configs);
                
                // Fetch variants
                this.mockService.getProductVariants(this.product.id).subscribe((vars) => {
                  if (vars.length > 0) {
                    this.generatedVariants.set(JSON.parse(JSON.stringify(vars))); // deep copy
                  } else {
                    this.generateVariants();
                  }
                });
              }
            });
          });
        } else {
          this.generateVariants();
        }
      });
    }
  }

  private resolveRecapNames() {
    if (this.product.category_id) {
      this.mockService.getCategories().subscribe((cats) =>
        this.categoryName.set(cats.find((c) => c.id === this.product.category_id)?.name ?? '—'),
      );
    }
    if (this.product.vendor_id) {
      this.mockService.getVendors().subscribe((vs) =>
        this.vendorName.set(vs.find((v) => v.id === this.product.vendor_id)?.name ?? '—'),
      );
    }
    if (this.product.type_id) {
      this.mockService.getProductTypes().subscribe((ts) =>
        this.typeName.set(ts.find((t) => t.id === this.product.type_id)?.name ?? '—'),
      );
    }
    this.mockService.getChannels().subscribe((chs) => {
      if (chs.length) this.channelName.set(chs[0].name);
    });
  }

  /** Values displayed as chips are comma-separated in `valuesString`. */
  parseValues(valuesString: string): string[] {
    return valuesString
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  removeValue(configIdx: number, value: string) {
    this.optionsConfigs.update((configs) =>
      configs.map((c, i) =>
        i === configIdx
          ? { ...c, valuesString: this.parseValues(c.valuesString).filter((v) => v !== value).join(', ') }
          : c,
      ),
    );
    this.generateVariants();
  }

  addOptionDimension() {
    this.optionsConfigs.update((configs) => [
      ...configs,
      { name: 'Size', valuesString: '', useImages: false }
    ]);
  }

  removeOptionDimension(index: number) {
    this.optionsConfigs.update((configs) => configs.filter((_, i) => i !== index));
    this.generateVariants();
  }

  onConfigChange() {
    this.generateVariants();
  }

  generateVariants() {
    const configs = this.optionsConfigs();
    if (configs.length === 0) {
      this.generatedVariants.set([]);
      return;
    }

    // Parse options
    const parsedOptions = configs.map((c) => ({
      name: c.name,
      values: c.valuesString
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    })).filter((o) => o.values.length > 0);

    if (parsedOptions.length === 0) {
      this.generatedVariants.set([]);
      return;
    }

    // Helper to cross multiply options
    const combos: { optionName: string; valueName: string; valueId: string }[][] = [];
    
    const cartesian = (optIdx: number, currentCombo: { optionName: string; valueName: string; valueId: string }[]) => {
      if (optIdx === parsedOptions.length) {
        combos.push([...currentCombo]);
        return;
      }
      
      const opt = parsedOptions[optIdx];
      opt.values.forEach((valName, valIdx) => {
        currentCombo.push({
          optionName: opt.name,
          valueName: valName,
          valueId: `val-${opt.name.toLowerCase()}-${valName.toLowerCase()}-${valIdx}`
        });
        cartesian(optIdx + 1, currentCombo);
        currentCombo.pop();
      });
    };

    cartesian(0, []);

    // Map combinations to ProductVariant models
    const existingMap = new Map(this.generatedVariants().map((v) => [v.sku, v]));

    const variants: ProductVariant[] = combos.map((combo, idx) => {
      const displaySku = `${this.product.sku || 'PROD'}-${combo.map((c) => c.valueName.substring(0, 3).toUpperCase()).join('-')}`;
      
      // If we already configured this combination sku, preserve its details
      const existing = existingMap.get(displaySku);
      if (existing) {
        return {
          ...existing,
          option_values: combo
        };
      }

      return {
        id: `var-${idx}-${Date.now()}`,
        product_id: this.product.id,
        sku: displaySku,
        price_minor: this.product.price_minor || 0,
        is_active: true,
        is_default: idx === 0,
        option_values: combo
      };
    });

    this.generatedVariants.set(variants);
  }

  makeDefault(variantId: string) {
    this.generatedVariants.update((vars) =>
      vars.map((v) => ({
        ...v,
        is_default: v.id === variantId
      }))
    );
  }

  close() {
    this.visibleChange.emit(false);
  }

  save() {
    const configs = this.optionsConfigs();
    const parsedOptions = configs.map((c) => ({
      name: c.name,
      values: c.valuesString.split(',').map((v) => v.trim()).filter((v) => v.length > 0),
      useImages: c.useImages
    })).filter((o) => o.values.length > 0);

    // Save options & option values first
    this.mockService.saveProductOptionsAndValues(this.product.id, parsedOptions).subscribe(() => {
      // Save product variants
      this.mockService.saveProductVariants(this.product.id, this.generatedVariants()).subscribe(() => {
        this.variantsSaved.emit();
        this.close();
      });
    });
  }
}

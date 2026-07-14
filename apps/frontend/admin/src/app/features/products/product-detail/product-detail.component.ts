import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { EditorModule } from 'primeng/editor';
import { CatalogApiService } from '../data/catalog-api.service';
import {
  Product,
  Category,
  Vendor,
  ProductType,
  Channel,
  Tag,
  ProductVariant,
  ProductComment,
  Location
} from '../data/products.models';
import { AddImagePanelComponent } from '../components/add-image-panel.component';
import { AddProductVariantsDialogComponent } from '../components/add-product-variants-dialog.component';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    ButtonModule,
    SelectModule,
    SelectButtonModule,
    InputNumberModule,
    MultiSelectModule,
    ToggleSwitchModule,
    ChartModule,
    DialogModule,
    EditorModule,
    AddImagePanelComponent,
    AddProductVariantsDialogComponent,
  ],
  templateUrl: './product-detail.component.html',
})
export class ProductDetailComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly mockService = inject(CatalogApiService);

  // Data lists
  readonly categories = signal<Category[]>([]);
  readonly vendors = signal<Vendor[]>([]);
  readonly productTypes = signal<ProductType[]>([]);
  readonly channelsList = signal<Channel[]>([]);
  readonly tagsList = signal<Tag[]>([]);
  readonly locations = signal<Location[]>([]);
  readonly primaryLocationName = computed(() => {
    const locs = this.locations();
    return locs.find((l) => l.is_default)?.name ?? locs[0]?.name ?? 'No warehouse configured';
  });

  // State management
  readonly isEditMode = signal<boolean>(false);
  readonly productId = signal<string>('');
  readonly productImages = signal<string[]>([]);
  readonly productVariants = signal<ProductVariant[]>([]);
  readonly comments = signal<ProductComment[]>([]);
  readonly productTotalStock = signal<number>(0);
  readonly productStockStatus = signal<string>('High');

  // Sub-dialog indicators
  readonly showAddImageDialog = signal<boolean>(false);
  readonly showVariantsDialog = signal<boolean>(false);

  // Inline "+ New" quick-add for Sales Channels / Tag Classifiers
  readonly showQuickAddDialog = signal(false);
  readonly quickAddKind = signal<'channel' | 'tag'>('tag');
  readonly quickAddName = signal('');
  readonly quickAddChannelKind = signal<Channel['kind']>('online_store');
  readonly quickAddSaving = signal(false);
  readonly quickAddError = signal<string | null>(null);

  readonly channelKindOptions = [
    { label: 'Online Store', value: 'online_store' },
    { label: 'Point of Sale', value: 'pos' },
    { label: 'Manual', value: 'manual' },
    { label: 'Marketplace', value: 'marketplace' },
    { label: 'Mobile App', value: 'mobile_app' },
  ];

  // Form group definition
  form!: FormGroup;

  // AI Prompt drawer for product description
  readonly aiPromptText = signal<string>('');
  readonly isAiWriting = signal<boolean>(false);

  // New comment box state
  readonly newCommentText = signal<string>('');

  // Derived Pricing Margins (computed from Form values)
  readonly salesPrice = signal<number>(0);
  readonly costPerItem = signal<number>(0);

  readonly profit = computed(() => this.salesPrice() - this.costPerItem());
  
  readonly grossMargin = computed(() => {
    const price = this.salesPrice();
    if (price <= 0) return 0;
    return (this.profit() / price) * 100;
  });

  // Sparkline sales chart
  readonly sparklineData = {
    labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    datasets: [
      {
        data: [12, 25, 18, 38, 22, 45, 60],
        borderColor: '#F16D22',
        backgroundColor: 'transparent',
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0
      }
    ]
  };

  readonly weeklyUnitsSold = computed(() =>
    this.sparklineData.datasets[0].data.reduce((sum, n) => sum + n, 0)
  );

  readonly sparklineOptions = {
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    },
    scales: {
      x: { display: false },
      y: { display: false }
    },
    maintainAspectRatio: false
  };

  readonly statusOptions = [
    { label: 'Active', value: 'active' },
    { label: 'Draft', value: 'draft' },
    { label: 'Archived', value: 'archived' }
  ];

  readonly unitOptions = [
    { label: 'kg', value: 'kg' },
    { label: 'g', value: 'g' },
    { label: 'lb', value: 'lb' },
    { label: 'oz', value: 'oz' }
  ];

  readonly reorderMethods = [
    { label: 'Manual Reorder', value: 'manual' },
    { label: 'Automatic Reorder', value: 'automatic' }
  ];

  readonly productKindOptions = [
    { label: 'Physical Product', value: 'physical' },
    { label: 'Digital Product / License', value: 'digital' }
  ];

  constructor() {
    this.initForm();
  }

  ngOnInit() {
    this.loadCatalogOptions();
    
    this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id && id !== 'new') {
        this.isEditMode.set(true);
        this.productId.set(id);
        this.loadProductDetails(id);
      } else {
        this.isEditMode.set(false);
        this.productId.set('');
        this.loadNewProductDefaults();
      }
    });
  }

  private initForm() {
    this.form = this.fb.group({
      name: ['', Validators.required],
      sku: [''],
      description: [''],
      status: ['draft', Validators.required],
      kind: ['physical', Validators.required],
      price: [0, [Validators.min(0)]],
      compareAt: [0, [Validators.min(0)]],
      cost: [0, [Validators.min(0)]],
      chargeTax: [true],
      category_id: [null],
      type_id: [null],
      vendor_id: [null],
      channels: [[]],
      tags: [[]],
      // Shipping properties
      weight_value: [0],
      weight_unit: ['kg'],
      length_cm: [0],
      width_cm: [0],
      height_cm: [0],
      ships_internationally: [false],
      continue_selling_oos: [false],
      is_dropship: [false],
      // Warehouse stock properties
      reorder_method: ['manual'],
      reorder_qty: [50],
      reorder_point_active: [false]
    });

    // Listen to form value changes to calculate derived pricing values dynamically
    this.form.get('price')?.valueChanges.subscribe(val => {
      this.salesPrice.set(val || 0);
    });
    this.form.get('cost')?.valueChanges.subscribe(val => {
      this.costPerItem.set(val || 0);
    });
  }

  private loadCatalogOptions() {
    this.mockService.getCategories().subscribe(c => this.categories.set(c));
    this.mockService.getVendors().subscribe(v => this.vendors.set(v));
    this.mockService.getProductTypes().subscribe(t => this.productTypes.set(t));
    this.mockService.getChannels().subscribe(ch => this.channelsList.set(ch));
    this.mockService.getTags().subscribe(tg => this.tagsList.set(tg));
    this.mockService.getLocations().subscribe(locs => this.locations.set(locs));
  }

  protected getVariantsProduct(): any {
    return {
      id: this.productId(),
      name: this.form.get('name')?.value,
      sku: this.form.get('sku')?.value,
      price_minor: (this.form.get('price')?.value || 0) * 100,
      status: this.form.get('status')?.value
    };
  }

  protected loadProductDetails(id: string) {
    this.mockService.getProductById(id).subscribe((product) => {
      if (!product) {
        this.router.navigate(['/products']);
        return;
      }

      this.form.patchValue({
        name: product.name,
        sku: product.sku,
        description: product.description,
        status: product.status,
        kind: product.kind,
        price: (product.price_minor || 0) / 100,
        compareAt: (product.compare_at_minor || 0) / 100,
        cost: (product.cost_minor || 0) / 100,
        chargeTax: product.charge_tax,
        category_id: product.category_id,
        type_id: product.type_id,
        vendor_id: product.vendor_id,
        weight_value: product.weight_value || 0,
        weight_unit: product.weight_unit || 'kg',
        length_cm: product.length_cm || 0,
        width_cm: product.width_cm || 0,
        height_cm: product.height_cm || 0,
        ships_internationally: product.ships_internationally,
        continue_selling_oos: product.continue_selling_oos,
        is_dropship: product.is_dropship,
        reorder_method: 'manual',
        reorder_qty: 25,
        reorder_point_active: true
      });

      // Update calculations
      this.salesPrice.set((product.price_minor || 0) / 100);
      this.costPerItem.set((product.cost_minor || 0) / 100);

      // Load specific attachments
      this.mockService.getProductImages(id).subscribe(imgs => this.productImages.set(imgs));
      this.mockService.getProductVariants(id).subscribe(vars => this.productVariants.set(vars));
      this.mockService.getComments(id).subscribe(cms => this.comments.set(cms));
      
      // Stock rollup
      this.mockService.getProductTotalStock(id).subscribe(stk => {
        this.productTotalStock.set(stk.count);
        this.productStockStatus.set(stk.status);
      });
    });
  }

  private loadNewProductDefaults() {
    this.form.reset({
      name: '',
      sku: '',
      description: '',
      status: 'draft',
      kind: 'physical',
      price: 0,
      compareAt: 0,
      cost: 0,
      chargeTax: true,
      category_id: null,
      type_id: null,
      vendor_id: null,
      channels: [],
      tags: [],
      weight_value: 0,
      weight_unit: 'kg',
      length_cm: 0,
      width_cm: 0,
      height_cm: 0,
      ships_internationally: false,
      continue_selling_oos: false,
      is_dropship: false,
      reorder_method: 'manual',
      reorder_qty: 10,
      reorder_point_active: false
    });
    this.productImages.set([]);
    this.productVariants.set([]);
    this.comments.set([]);
    this.productTotalStock.set(0);
    this.productStockStatus.set('Out of Stock');
  }

  generateDescriptionWithAI() {
    if (!this.aiPromptText()) return;
    this.isAiWriting.set(true);
    
    setTimeout(() => {
      this.isAiWriting.set(false);
      const generated = `<p>This is a premium product designed with state of the art components. Key features include:</p><ul><li>AI Optimized performance</li><li>Unrivaled build quality with premium materials</li><li>Sleek, minimalist dark aesthetics matching modern workspaces</li></ul><p>Optimized for store channels with high conversions based on prompt: "${this.aiPromptText()}"</p>`;
      this.form.patchValue({ description: generated });
      this.aiPromptText.set('');
    }, 2000);
  }

  addImageUrl(url: string) {
    if (this.isEditMode()) {
      this.mockService.addProductImage(this.productId(), url).subscribe(imgs => {
        this.productImages.set(imgs);
        this.showAddImageDialog.set(false);
      });
    } else {
      this.productImages.update(imgs => [...imgs, url]);
      this.showAddImageDialog.set(false);
    }
  }

  removeImage(url: string) {
    if (this.isEditMode()) {
      this.mockService.removeProductImage(this.productId(), url).subscribe(imgs => {
        this.productImages.set(imgs);
      });
    } else {
      this.productImages.update(imgs => imgs.filter(img => img !== url));
    }
  }

  postComment() {
    if (!this.newCommentText().trim()) return;
    this.mockService.addComment(this.productId(), this.newCommentText()).subscribe(c => {
      this.comments.update(list => [c, ...list]);
      this.newCommentText.set('');
    });
  }

  openQuickAdd(kind: 'channel' | 'tag') {
    this.quickAddKind.set(kind);
    this.quickAddName.set('');
    this.quickAddChannelKind.set('online_store');
    this.quickAddError.set(null);
    this.showQuickAddDialog.set(true);
  }

  saveQuickAdd() {
    const trimmed = this.quickAddName().trim();
    if (!trimmed || this.quickAddSaving()) return;
    this.quickAddSaving.set(true);
    this.quickAddError.set(null);

    const kind = this.quickAddKind();
    const request$ =
      kind === 'channel'
        ? this.mockService.createChannel({ name: trimmed, kind: this.quickAddChannelKind() })
        : this.mockService.createTag({ name: trimmed });

    request$.subscribe({
      next: (created) => {
        this.quickAddSaving.set(false);
        this.showQuickAddDialog.set(false);
        if (kind === 'channel') {
          this.channelsList.update((list) => [...list, created as Channel]);
          this.form.patchValue({ channels: [...(this.form.get('channels')?.value || []), created.id] });
        } else {
          this.tagsList.update((list) => [...list, created as Tag]);
          this.form.patchValue({ tags: [...(this.form.get('tags')?.value || []), created.id] });
        }
      },
      error: () => {
        this.quickAddSaving.set(false);
        this.quickAddError.set(`Failed to create this ${kind}. Please try again.`);
      },
    });
  }

  save() {
    if (this.form.invalid) return;

    const formValues = this.form.value;
    const productPayload: Partial<Product> = {
      name: formValues.name,
      description: formValues.description,
      status: formValues.status,
      kind: formValues.kind,
      sku: formValues.sku,
      category_id: formValues.category_id,
      type_id: formValues.type_id,
      vendor_id: formValues.vendor_id,
      price_minor: Math.round(formValues.price * 100),
      compare_at_minor: Math.round(formValues.compareAt * 100),
      cost_minor: Math.round(formValues.cost * 100),
      charge_tax: formValues.chargeTax,
      weight_value: formValues.weight_value,
      weight_unit: formValues.weight_unit,
      length_cm: formValues.length_cm,
      width_cm: formValues.width_cm,
      height_cm: formValues.height_cm,
      ships_internationally: formValues.ships_internationally,
      continue_selling_oos: formValues.continue_selling_oos,
      is_dropship: formValues.is_dropship
    };

    if (this.isEditMode()) {
      this.mockService.updateProduct(this.productId(), productPayload).subscribe(() => {
        this.router.navigate(['/products']);
      });
    } else {
      this.mockService.createProduct(productPayload).subscribe((newProduct) => {
        // Save images if any pre-added
        this.productImages().forEach(img => {
          this.mockService.addProductImage(newProduct.id, img).subscribe();
        });
        this.router.navigate(['/products']);
      });
    }
  }

  cancelEdit() {
    this.router.navigate(['/products']);
  }
}

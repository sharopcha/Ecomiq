import { Route } from '@angular/router';

export const inventoryRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./inventory-list/inventory-list.component').then((m) => m.InventoryListComponent),
  },
  {
    path: 'warehouses',
    loadComponent: () =>
      import('./locations-list/locations-list.component').then((m) => m.LocationsListComponent),
  },
  {
    path: 'suppliers',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./suppliers-list/suppliers-list.component').then((m) => m.SuppliersListComponent),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./supplier-detail/supplier-detail.component').then((m) => m.SupplierDetailComponent),
      }
    ]
  },
  {
    path: 'purchasing',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./purchasing-list/purchasing-list.component').then((m) => m.PurchasingListComponent),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./purchasing-list/create-po-wizard.component').then((m) => m.CreatePoWizardComponent),
      }
    ]
  },
];

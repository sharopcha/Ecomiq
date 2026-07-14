import { Route } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'products',
        loadChildren: () => import('./features/products/products.routes').then((m) => m.productsRoutes),
      },
      {
        path: 'inventory',
        loadChildren: () => import('./features/inventory/inventory.routes').then((m) => m.inventoryRoutes),
      },
      {
        path: 'orders',
        loadChildren: () => import('./features/orders/orders.routes').then((m) => m.ordersRoutes),
      },
      {
        path: 'bundles',
        loadComponent: () => import('./features/products/bundles-stub/bundles-stub.component').then((m) => m.BundlesStubComponent),
      },
      {
        path: 'licenses',
        loadComponent: () => import('./features/products/licenses-stub/licenses-stub.component').then((m) => m.LicensesStubComponent),
      },
      {
        path: 'dropshipping',
        loadComponent: () => import('./features/products/dropshipping-stub/dropshipping-stub.component').then((m) => m.DropshippingStubComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];


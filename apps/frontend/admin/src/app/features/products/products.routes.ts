import { Route } from '@angular/router';

export const productsRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./products-list/products-list.component').then((m) => m.ProductsListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./product-detail/product-detail.component').then((m) => m.ProductDetailComponent),
  },
  {
    path: 'taxonomy',
    loadComponent: () => import('./taxonomy/taxonomy.component').then((m) => m.TaxonomyComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./product-detail/product-detail.component').then((m) => m.ProductDetailComponent),
  },
];

import { Route } from '@angular/router';

export const ordersRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./orders-list/orders-list.component').then((m) => m.OrdersListComponent),
  },
  {
    path: 'shipments',
    loadComponent: () => import('./shipments/shipments-list/shipments-list.component').then(m => m.ShipmentsListComponent)
  },
  {
    path: 'shipments/:id',
    loadComponent: () => import('./shipments/shipment-detail/shipment-detail.component').then(m => m.ShipmentDetailComponent)
  },
  {
    path: 'returns',
    loadComponent: () => import('./returns/returns-list/returns-list.component').then(m => m.ReturnsListComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./order-detail/order-detail.component').then((m) => m.OrderDetailComponent),
  },
];

import { Component, computed, inject, signal, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../core/auth/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { PopoverModule } from 'primeng/popover';
import { TooltipModule } from 'primeng/tooltip';
import { NotificationApiService } from '../features/notifications/data/notification-api.service';
import { Notification } from '../features/notifications/data/notification.models';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, PopoverModule, DatePipe, TitleCasePipe, TooltipModule],
  templateUrl: './shell.component.html',
  styleUrls: [], // Styling will be done via Tailwind utility classes
})
export class ShellComponent {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === '/' && document.activeElement !== this.searchInput?.nativeElement) {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
      this.searchInput?.nativeElement.select();
    }
  }
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificationApi = inject(NotificationApiService);

  readonly notifications = signal<Notification[]>([]);
  readonly unreadCount = signal<number>(0);

  // Secondary sidebar collapse state
  readonly isSubSidebarCollapsed = signal<boolean>(false);
  
  readonly hasSubSidebar = computed(() => {
    return this.isProductsWorkspace() || this.isInventoryWorkspace() || this.isOrdersWorkspace();
  });

  toggleSubSidebar() {
    this.isSubSidebarCollapsed.update((v) => !v);
  }

  constructor() {
    this.loadNotifications();
  }

  loadNotifications() {
    this.notificationApi.getUnreadCount().subscribe(count => this.unreadCount.set(count));
    this.notificationApi.getFeed().subscribe(res => this.notifications.set(res.data));
  }

  markAllAsRead(op: any) {
    this.notificationApi.markAllRead().subscribe(() => {
      this.loadNotifications();
      op.hide();
    });
  }

  markAsRead(notification: Notification) {
    if (!notification.read_at) {
      this.notificationApi.markRead(notification.id).subscribe(() => {
        this.loadNotifications();
      });
    }
  }

  // Capture navigation end events to update active route states and breadcrumbs
  private readonly navEndEvent = toSignal(
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
  );

  // Computed properties for UI state
  readonly currentUrl = computed(() => this.navEndEvent()?.urlAfterRedirects ?? this.router.url);

  readonly isProductsWorkspace = computed(() => {
    const url = this.currentUrl();
    return (
      url.startsWith('/products') ||
      url.startsWith('/bundles') ||
      url.startsWith('/licenses') ||
      url.startsWith('/dropshipping')
    );
  });

  readonly isInventoryWorkspace = computed(() => {
    const url = this.currentUrl();
    return url.startsWith('/inventory');
  });

  readonly isOrdersWorkspace = computed(() => {
    const url = this.currentUrl();
    return url.startsWith('/orders');
  });

  readonly breadcrumbs = computed(() => {
    const url = this.currentUrl();
    const storeName = this.auth.store()?.name ?? 'Ecomiq Store';
    
    if (url.startsWith('/products/new')) {
      return [storeName, 'Products', 'Add New Product'];
    }
    if (url.match(/^\/products\/prod-[a-zA-Z0-9-]+$/)) {
      return [storeName, 'Products', 'Edit Product'];
    }
    if (url.startsWith('/products')) {
      return [storeName, 'Products'];
    }
    if (url.startsWith('/inventory/warehouses')) {
      return [storeName, 'Inventory', 'Warehouses'];
    }
    if (url.startsWith('/inventory/suppliers')) {
      return [storeName, 'Inventory', 'Supplier'];
    }
    if (url.startsWith('/inventory/purchasing')) {
      return [storeName, 'Inventory', 'Purchasing'];
    }
    if (url.startsWith('/inventory')) {
      return [storeName, 'Inventory'];
    }
    if (url.startsWith('/bundles')) {
      return [storeName, 'Bundles'];
    }
    if (url.startsWith('/licenses')) {
      return [storeName, 'License Keys'];
    }
    if (url.startsWith('/dropshipping')) {
      return [storeName, 'Dropshipping'];
    }
    if (url.match(/^\/orders\/ord-[a-zA-Z0-9-]+$/)) {
      return [storeName, 'Orders', 'Order Details'];
    }
    if (url.startsWith('/orders/shipments')) {
      return [storeName, 'Orders', 'Shipments'];
    }
    if (url.startsWith('/orders/returns')) {
      return [storeName, 'Orders', 'Returns & Refunds'];
    }
    if (url.startsWith('/orders')) {
      return [storeName, 'Orders'];
    }
    return [storeName, 'Dashboard'];
  });



  logout() {
    this.auth.logout().subscribe({
      next: () => {
        this.router.navigate(['/auth/login']);
      }
    });
  }
}

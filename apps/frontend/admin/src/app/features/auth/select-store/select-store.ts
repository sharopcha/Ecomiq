import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';
import { StoreSummary } from '../../../core/auth/auth.models';

@Component({
  selector: 'app-select-store',
  imports: [RouterLink, MessageModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1>Choose a store</h1>
        <p class="auth-subtitle">You have access to more than one store.</p>

        @if (error()) {
          <p-message severity="error">{{ error() }}</p-message>
        }

        @if (!stores().length) {
          <p-message severity="error">No pending login found. Please log in again.</p-message>
        } @else {
          @for (s of stores(); track s.id) {
            <div class="store-option" (click)="choose(s)">
              <span>{{ s.name }}</span>
              <span class="auth-subtitle" style="margin:0">{{ s.role }}</span>
            </div>
          }
        }

        <p class="auth-footer">
          <a routerLink="/auth/login">Back to log in</a>
        </p>
      </div>
    </div>
  `,
  styleUrl: '../auth-shared.css',
})
export class SelectStore {
  readonly error = signal<string | null>(null);
  private readonly queryStores = signal<StoreSummary[] | null>(null);

  readonly stores = computed(() => this.auth.pendingStores() ?? this.queryStores() ?? []);

  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    const raw = this.route.snapshot.queryParamMap.get('stores');
    const selectionToken = this.route.snapshot.queryParamMap.get('selectionToken');
    if (raw && selectionToken) {
      try {
        const parsed: StoreSummary[] = JSON.parse(raw);
        this.queryStores.set(parsed);
        this.auth.setPendingStoreSelection(selectionToken, parsed);
      } catch {
        this.queryStores.set(null);
      }
    }
  }

  choose(store: StoreSummary) {
    this.error.set(null);
    this.auth.selectStore(store.id).subscribe({
      next: (res) => {
        if (res.status === 'ok') this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Could not select that store');
      },
    });
  }
}

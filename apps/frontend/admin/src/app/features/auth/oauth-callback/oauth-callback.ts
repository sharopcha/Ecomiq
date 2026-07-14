import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-oauth-callback',
  imports: [RouterLink, MessageModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1>Signing you in…</h1>
        @if (error()) {
          <p-message severity="error">{{ error() }}</p-message>
          <p class="auth-footer"><a routerLink="/auth/login">Back to log in</a></p>
        }
      </div>
    </div>
  `,
  styleUrl: '../auth-shared.css',
})
export class OauthCallback implements OnInit {
  readonly error = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('accessToken');
    if (!token) {
      this.error.set('Google sign-in did not return a valid session.');
      return;
    }
    this.auth.hydrateFromAccessToken(token).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: () => this.error.set('Could not complete Google sign-in.'),
    });
  }
}

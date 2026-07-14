import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-verify-2fa',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1>Two-factor verification</h1>
        <p class="auth-subtitle">Enter the 6-digit code from your authenticator app.</p>

        @if (!mfaToken()) {
          <p-message severity="error">
            No pending login found. Please log in again.
          </p-message>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form">
            <label for="code">Authentication code</label>
            <input
              id="code"
              pInputText
              formControlName="code"
              inputmode="numeric"
              maxlength="6"
              autocomplete="one-time-code"
              class="w-full"
            />

            @if (error()) {
              <p-message severity="error">{{ error() }}</p-message>
            }

            <button
              pButton
              type="submit"
              label="Verify"
              [loading]="loading()"
              [disabled]="form.invalid || loading()"
              class="w-full"
            ></button>
          </form>
        }

        <p class="auth-footer">
          <a routerLink="/auth/login">Back to log in</a>
        </p>
      </div>
    </div>
  `,
  styleUrl: '../auth-shared.css',
})
export class Verify2fa {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly mfaToken = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  constructor() {
    // Supports both the in-app login flow (token held in AuthService state)
    // and the Google OAuth redirect flow (token passed as a query param).
    this.mfaToken.set(
      this.auth.pendingMfaToken() ?? this.route.snapshot.queryParamMap.get('mfaToken'),
    );
  }

  submit() {
    if (this.form.invalid || !this.mfaToken()) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth
      .verify2fa({ mfaToken: this.mfaToken()!, code: this.form.getRawValue().code! })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          if (res.status === 'ok') this.router.navigateByUrl('/');
          else if (res.status === 'store_selection_required')
            this.router.navigate(['/auth/select-store']);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Invalid authentication code');
        },
      });
  }
}
